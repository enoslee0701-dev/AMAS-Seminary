# VoiceTransport

A thin abstraction over real-time voice backends so the AMAS voice room can
run against a local mock during dev and swap to LiveKit or Agora in
production without touching UI code.

## Why this exists

The voice room (see `components/VoiceRoom/`) renders participants, their
speaking indicators, and mute state. Those facts can come from many places:
hardcoded mock data, a LiveKit SFU, an Agora channel, or future backends.
Rather than spread SDK-specific code through the UI, every backend
implements the `VoiceTransport` interface in `types.ts` and the UI only
talks to that interface.

## Public surface

```ts
import { createVoiceTransport } from '@/services/voiceTransport';

const transport = createVoiceTransport(); // picks impl from VITE_VOICE_TRANSPORT

const unsubscribe = transport.subscribe({
  onConnected:          () => console.log('joined'),
  onParticipantsChange: (list) => setParticipants(list),
  onSpeakingChange:     (id, speaking) => /* update one row */,
  onError:              (err) => toast(err.message),
  onDisconnected:       () => setParticipants([]),
});

await transport.join('room-123', currentUser.id, currentUser.name);
await transport.setMicEnabled(true);
// ...
await transport.leave();
unsubscribe();
```

## Choosing a transport

Set in `.env` (or `.env.local`):

```
VITE_VOICE_TRANSPORT=mock      # default
VITE_VOICE_TRANSPORT=livekit
VITE_VOICE_TRANSPORT=agora
```

Or pass explicitly in tests: `createVoiceTransport('mock')`.

## Plugging in LiveKit

1. **Sign up** at <https://livekit.io> (cloud) or self-host.
2. **Install the SDK**: `npm install livekit-client`.
3. **Stand up a token server.** The browser must never see your API secret.
   Use `livekit-server-sdk` in a small Node/Edge endpoint that signs JWTs:

   ```ts
   // POST /api/livekit/token  { roomId, userId, userName } -> { token }
   import { AccessToken } from 'livekit-server-sdk';
   const at = new AccessToken(API_KEY, API_SECRET, { identity: userId, name: userName });
   at.addGrant({ roomJoin: true, room: roomId });
   return { token: await at.toJwt() };
   ```

4. **Env vars** (Vite-exposed):

   ```
   VITE_LIVEKIT_URL=wss://<your-project>.livekit.cloud
   VITE_LIVEKIT_TOKEN_ENDPOINT=/api/livekit/token
   VITE_VOICE_TRANSPORT=livekit
   ```

5. **Fill in `LiveKitTransport.ts`** — the file has a step-by-step TODO at
   the top covering token fetch, `Room.connect()`, event wiring, and the
   participant-mapping helper. Roles aren't native to LiveKit; sign them
   into `participant.metadata` from the token server.

## Plugging in Agora

Agora is the recommended transport for mainland-China users — LiveKit Cloud
runs on AWS and is frequently slow or blocked there, while Agora's SD-RTN
has POPs inside China.

1. **Create a project** at <https://console.agora.io>, switch authentication
   to "App ID + App Certificate", and copy both values.
2. **Install the SDK** (already a dependency of this repo):
   `npm install agora-rtc-sdk-ng`.
3. **Backend token endpoint is already implemented** in
   `backend/src/routes/voice.ts` as `POST /api/voice/agora-token`. The App
   Certificate stays on the backend; the response includes `appId`, `token`,
   `uid`, `channelName`, and `expiresAt`. The browser never sees the
   certificate.

   The endpoint uses `agora-token`:

   ```ts
   // POST /api/voice/agora-token  { channelName, uid, role? } -> { appId, token, uid, channelName, expiresAt }
   import { RtcTokenBuilder, RtcRole } from 'agora-token';
   const token = RtcTokenBuilder.buildTokenWithUid(
     appId, appCertificate, channelName, uid,
     RtcRole.PUBLISHER, ttlSeconds, ttlSeconds,
   );
   ```

4. **Backend env vars** (in `backend/.env`):

   ```
   AGORA_APP_ID=<your-app-id>
   AGORA_APP_CERTIFICATE=<your-app-certificate>   # SECRET — never ship to client
   ```

   `assertConfigured('agora')` in `backend/src/config.ts` throws a clear
   error if either is missing.

5. **Frontend env vars** (in project root `.env`):

   ```
   VITE_API_BASE_URL=https://<your-backend>     # same as for LiveKit / Gemini
   VITE_VOICE_TRANSPORT=agora
   ```

   Notice there's no `VITE_AGORA_APP_ID` — the App ID is returned by the
   backend alongside the token, so the frontend has nothing Agora-specific
   to configure.

6. **`AgoraTransport.ts`** is implemented and mirrors `LiveKitTransport.ts`:

   - `agora-rtc-sdk-ng` is dynamically `import()`-ed inside `join()` so the
     ~150 KB SDK is split into its own chunk and never loaded when running
     mock or LiveKit modes.
   - Events wired: `user-joined`, `user-left`, `user-published`,
     `user-unpublished`, `volume-indicator`, `connection-state-change`.
   - `client.enableAudioVolumeIndicator()` is called after `join`; the
     transport thresholds `volume-indicator` levels (>5 of 0..100) to derive
     `isSpeaking` and emits per-uid `onSpeakingChange`. Agora reports the
     local user with `uid: 0` in this event — the transport remaps it.
   - `setMicEnabled(true)` lazily creates a `MicrophoneAudioTrack` and
     publishes it. `setMicEnabled(false)` unpublishes and closes the track.
   - `leave()` unpublishes + closes the mic track, removes all listeners,
     and calls `client.leave()`.

7. **Known limitation: no metadata.** Agora has no equivalent to LiveKit's
   `participant.metadata`. The transport therefore uses the `uid` as the
   participant `id` *and* `name`, derives the avatar via
   `https://i.pravatar.cc/120?u=<uid>`, and defaults `role` to `'member'`.
   For real display names, roles, or avatars, layer Agora RTM (or your own
   signaling channel) keyed by uid on top of this transport.

## Integration point (wired separately)

`components/VoiceRoom/useGeminiLive.ts` and
`components/VoiceRoom/VoiceRoomOverlay.tsx` will be updated in a follow-up
to consume `createVoiceTransport()` for the participant list. Until that
wiring lands, this module is standalone and has no runtime effect on the
app.
