import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronDown, ChevronUp, Play, Lock, CheckCircle, FileText, Download, Clock, Share2, MoreHorizontal, BookOpen, AlertCircle, PlayCircle, PauseCircle, Heart, Flag, Link as LinkIcon, ZoomIn, ZoomOut, X, Edit2, Save, Image as ImageIcon, Upload, RefreshCw } from 'lucide-react';
import { Course, TheologyCategory } from '../types';
import { MOCK_COURSE_DETAILS } from '../constants';
import { canEditCourses } from '../services/permissions';
import {
  listCourseFiles,
  uploadCourseFile,
  downloadCourseFile,
  isBackendConfigured as isCoursesBackendConfigured,
  type CourseFile,
} from '../services/coursesService';

// Helper to compress images
const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 600;
        const MAX_HEIGHT = 600;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        // Compress to JPEG at 60% quality
        resolve(canvas.toDataURL('image/jpeg', 0.6)); 
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

interface CourseDetailViewProps {
  course: Course;
  onUpdateCourse: (course: Course) => void;
  onBack: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  /** Logged-in user's role; gates the course-editing UI. */
  userRole?: string;
  /** Persist per-user lesson progress (count + %) up to App + backend. */
  onProgressChange?: (courseId: string, progress: number, completedLessons: number) => void;
}

// Per-user lesson progress: the user marks lessons complete; we recompute the
// completed-count + percentage and push them to onProgressChange, which App
// persists via setCourseProgress (per-user endpoint) and merges back on boot
// (App.tsx > listMyProgress). Per-lesson completion is reconstructed from the
// persisted count (sequential), since the backend stores a count, not per-id.
const CourseDetailView: React.FC<CourseDetailViewProps> = ({ course, onUpdateCourse, onBack, isFavorite, onToggleFavorite, userRole, onProgressChange }) => {
  const [activeTab, setActiveTab] = useState<'intro' | 'syllabus' | 'materials'>('syllabus');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isDescExpanded, setIsDescExpanded] = useState(false);
  
  // UI States for Header Actions
  const [showMenu, setShowMenu] = useState(false);
  const [showShareToast, setShowShareToast] = useState(false);
  const [showDownloadToast, setShowDownloadToast] = useState(false);
  const [downloadFileName, setDownloadFileName] = useState("");
  const [downloaded, setDownloaded] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('amas_downloaded_files') || '[]')); }
    catch { return new Set(); }
  });
  const [reportModal, setReportModal] = useState(false);
  const [reportReason, setReportReason] = useState<string>('');
  const [reportSubmitted, setReportSubmitted] = useState(false);
  
  // Edit State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
      title: course.title,
      instructor: course.instructor,
      thumbnail: course.thumbnail,
      category: course.category,
      thumbnailPreview: '' 
  });
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [course.id]);

  // Sync edit form when course changes (e.g. from external updates)
  useEffect(() => {
    setEditForm({
      title: course.title,
      instructor: course.instructor,
      thumbnail: course.thumbnail,
      category: course.category,
      thumbnailPreview: '' 
    });
  }, [course]);

  const isAdmin = canEditCourses(userRole);

  // PDF Preview State
  const [previewFile, setPreviewFile] = useState<{title: string, size: string} | null>(null);
  
  // Fallback mock details if specific course details aren't defined
  const details = MOCK_COURSE_DETAILS[course.id] || MOCK_COURSE_DETAILS['c_1cor'];
  const hasSyllabus = Array.isArray(details?.syllabus) && details.syllabus.length > 0;

  // Initialize with the first lesson or the first 'in-progress' one (null-safe if syllabus empty)
  const initialLesson = hasSyllabus
    ? (details.syllabus.find((l: any) => l.status === 'in-progress') || details.syllabus[0])
    : null;
  const [currentLesson, setCurrentLesson] = useState<any>(initialLesson);

  // Helper for Syllabus Icons
  const getLessonIcon = (status: string) => {
    if (status === 'locked') return <Lock size={16} className="text-slate-300" />;
    if (status === 'completed') return <CheckCircle size={16} className="text-emerald-500" />;
    return <PlayCircle size={16} className="text-blue-600" />;
  };

  // --- Per-user lesson completion -----------------------------------------
  const syllabus: any[] = hasSyllabus ? details.syllabus : [];
  const totalLessons = syllabus.length || course.totalLessons || 0;
  // Seed from whichever is larger: the static "completed" markers, or the
  // user's persisted completed-count (reconstructed as the first N lessons,
  // which matches the sequential-unlock model below).
  const seedCount = Math.max(
    syllabus.filter((l) => l.status === 'completed').length,
    course.completedLessons || 0,
  );
  const [completedIds, setCompletedIds] = useState<Set<string>>(
    () => new Set(syllabus.slice(0, seedCount).map((l) => l.id)),
  );
  // A lesson is open once every lesson before it is complete (the first is
  // always open). Completion drives unlocking, so progress is actually reachable.
  const isUnlocked = (idx: number) => idx === 0 || syllabus.slice(0, idx).every((l) => completedIds.has(l.id));
  const statusOf = (lesson: any, idx: number) =>
    completedIds.has(lesson.id) ? 'completed' : (isUnlocked(idx) ? 'in-progress' : 'locked');

  const completedCount = completedIds.size;
  const progressPct = totalLessons ? Math.round((completedCount / totalLessons) * 100) : 0;

  const toggleComplete = (lesson: any, idx: number, e: React.MouseEvent) => {
    e.stopPropagation(); // don't trigger play
    if (statusOf(lesson, idx) === 'locked') return;
    setCompletedIds((prev) => {
      const next = new Set(prev);
      next.has(lesson.id) ? next.delete(lesson.id) : next.add(lesson.id);
      const count = next.size;
      const pct = totalLessons ? Math.round((count / totalLessons) * 100) : 0;
      onProgressChange?.(course.id, pct, count);
      return next;
    });
  };

  const handleLessonClick = (lesson: any, idx: number) => {
    if (statusOf(lesson, idx) === 'locked') {
      alert("请先完成上一节课程的学习。");
      return;
    }
    setCurrentLesson(lesson);
    setIsPlaying(true);
    setIsPaused(false); // Auto-play when switching lessons
    setShowControls(true);
  };

  // Auto-hide controls when playing
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    if (isPlaying && !isPaused && showControls) {
      timeout = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
    return () => clearTimeout(timeout);
  }, [isPlaying, isPaused, showControls]);

  const handleDownload = (filename: string) => {
    // Real browser download. The course-files backend endpoint isn't built
    // yet, so we generate a placeholder text payload here. Once
    // `GET /api/courses/:id/files/:fileId` exists, replace the inline blob
    // with a fetch + signed URL. — TODO(course-files)
    const content = `AMAS · 课程资料\n\n标题：${filename}\n时间：${new Date().toISOString()}\n\n（此为占位文件，真实内容将由后端 /api/courses/:id/files 接口在生产环境提供。）\n`;
    try {
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Defer revoke until after the click is fully processed.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.warn('[CourseDetail] download failed:', err);
    }
    const next = new Set(downloaded); next.add(filename);
    setDownloaded(next);
    try { localStorage.setItem('amas_downloaded_files', JSON.stringify(Array.from(next))); } catch {}
    setDownloadFileName(filename);
    setShowDownloadToast(true);
    setTimeout(() => setShowDownloadToast(false), 3000);
  };

  // --- Real course materials (backend files) ------------------------------
  const [serverFiles, setServerFiles] = useState<CourseFile[]>([]);
  const [filesBusy, setFilesBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshFiles = React.useCallback(async () => {
    if (!isCoursesBackendConfigured()) { setServerFiles([]); return; }
    const list = await listCourseFiles(course.id);
    setServerFiles(list);
  }, [course.id]);

  useEffect(() => { refreshFiles(); }, [refreshFiles]);

  const handlePickUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    setFilesBusy(true);
    try {
      const uploaded = await uploadCourseFile(course.id, file);
      if (uploaded) {
        await refreshFiles();
        setDownloadFileName(`${file.name} 已上传`);
        setShowDownloadToast(true);
        setTimeout(() => setShowDownloadToast(false), 2500);
      } else {
        alert('上传失败，请稍后重试。');
      }
    } finally {
      setFilesBusy(false);
    }
  };

  const handleRealDownload = async (f: CourseFile) => {
    setFilesBusy(true);
    try {
      const ok = await downloadCourseFile(course.id, f.id, f.filename);
      if (ok) {
        const next = new Set(downloaded); next.add(f.filename);
        setDownloaded(next);
        try { localStorage.setItem('amas_downloaded_files', JSON.stringify(Array.from(next))); } catch {}
      } else {
        alert('下载失败，请稍后重试。');
      }
    } finally {
      setFilesBusy(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  // --- Feature: Share Functionality ---
  const handleShare = async () => {
    const shareData = {
      title: `AMAS 课程推荐: ${course.title}`,
      text: `我在 AMAS 亚洲宣教神学院学习《${course.title}》，推荐给你！`,
      url: window.location.href,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        console.debug('Share canceled', err);
      }
    } else {
      // Fallback: Copy to clipboard
      navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
      setShowShareToast(true);
      setTimeout(() => setShowShareToast(false), 2000);
    }
    setShowMenu(false);
  };

  // --- Feature: More Menu Actions ---
  const toggleFavorite = () => {
    onToggleFavorite?.();
    setShowMenu(false);
  };

  const handleReport = () => {
    setShowMenu(false);
    setReportReason('');
    setReportSubmitted(false);
    setReportModal(true);
  };

  const submitReport = () => {
    if (!reportReason) return;
    try {
      const existing = JSON.parse(localStorage.getItem('amas_course_reports') || '[]');
      existing.push({ courseId: course.id, courseTitle: course.title, reason: reportReason, submittedAt: new Date().toISOString() });
      localStorage.setItem('amas_course_reports', JSON.stringify(existing));
    } catch {}
    setReportSubmitted(true);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setShowShareToast(true);
    setTimeout(() => setShowShareToast(false), 2000);
    setShowMenu(false);
  };

  // --- Edit Logic ---
  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          try {
            const compressed = await compressImage(file);
            setEditForm({ ...editForm, thumbnailPreview: compressed });
          } catch (err) {
            console.error("Compression failed", err);
            // Fallback
            const reader = new FileReader();
            reader.onloadend = () => {
                setEditForm({ ...editForm, thumbnailPreview: reader.result as string });
            };
            reader.readAsDataURL(file);
          }
      }
  };

  const handleSaveEdit = () => {
      onUpdateCourse({
          ...course,
          title: editForm.title,
          instructor: editForm.instructor,
          category: editForm.category,
          thumbnail: editForm.thumbnailPreview || editForm.thumbnail
      });
      setShowEditModal(false);
  };

  // --- PDF Preview Overlay Component ---
  const PdfPreviewOverlay = () => {
    if (!previewFile) return null;

    return (
      <div className="fixed inset-0 z-[60] bg-slate-100 flex flex-col animate-in slide-in-from-bottom duration-300">
        {/* Reader Header */}
        <div className="bg-white px-4 py-3 shadow-sm flex items-center justify-between pt-safe-top border-b border-slate-200 z-10">
           <button onClick={() => setPreviewFile(null)} className="p-2 -ml-2 rounded-full hover:bg-slate-100 transition">
              <ChevronLeft size={24} className="text-slate-700" />
           </button>
           <div className="flex-1 mx-4 text-center">
              <h3 className="text-sm font-bold text-slate-900 truncate">{previewFile.title}</h3>
              <p className="text-[10px] text-slate-500">{previewFile.size}</p>
           </div>
           <button
             onClick={() => handleDownload(previewFile.title)}
             className="p-2 -mr-2 rounded-full hover:bg-blue-50 text-blue-600 transition relative"
             aria-label={downloaded.has(previewFile.title) ? '已离线缓存' : '下载'}
           >
              <Download size={20} />
              {downloaded.has(previewFile.title) && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-500 rounded-full border-2 border-white" />}
           </button>
        </div>

        {/* Reader Content (Mock) */}
        <div className="flex-1 overflow-y-auto p-4 flex justify-center bg-slate-200/50 relative">
           <div className="w-full max-w-2xl bg-white shadow-lg min-h-[800px] p-8 md:p-12 space-y-6 text-slate-800 animate-fade-in">
              <div className="border-b border-slate-100 pb-6 mb-6">
                 <h1 className="text-2xl md:text-3xl font-serif font-bold text-center text-slate-900 leading-tight">{previewFile.title}</h1>
                 <p className="text-center text-slate-400 text-xs mt-4 uppercase tracking-widest">AMAS Theological Seminary • Study Material</p>
              </div>
              
              <div className="space-y-4">
                 <div className="h-4 bg-slate-100 rounded w-full"></div>
                 <div className="h-4 bg-slate-100 rounded w-11/12"></div>
                 <div className="h-4 bg-slate-100 rounded w-full"></div>
                 <div className="h-4 bg-slate-100 rounded w-4/5"></div>
              </div>

              <div className="py-4">
                 <h2 className="text-lg font-bold text-slate-800 mb-3">1. Introduction</h2>
                 <div className="space-y-3 text-slate-300">
                    {/* Simulated Text Lines */}
                    {Array.from({length: 8}).map((_, i) => (
                       <div key={i} className="h-3 bg-slate-100 rounded w-full" style={{width: `${Math.random() * 20 + 80}%`}}></div>
                    ))}
                 </div>
              </div>

              <div className="flex justify-center py-8 opacity-50">
                 <div className="w-16 h-16 border-4 border-slate-100 rounded-full flex items-center justify-center">
                    <FileText size={32} className="text-slate-200" />
                 </div>
              </div>

               <div className="space-y-3 text-slate-300">
                  {Array.from({length: 12}).map((_, i) => (
                     <div key={i} className="h-3 bg-slate-100 rounded w-full" style={{width: `${Math.random() * 30 + 70}%`}}></div>
                  ))}
               </div>
           </div>

           {/* Floating Controls */}
           <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-slate-800/90 backdrop-blur text-white rounded-full px-6 py-2.5 flex items-center space-x-6 shadow-xl z-20">
              <button className="hover:text-blue-300 transition"><ZoomOut size={18} /></button>
              <span className="text-xs font-mono font-bold select-none">100%</span>
              <button className="hover:text-blue-300 transition"><ZoomIn size={18} /></button>
           </div>
        </div>
      </div>
    );
  };

  const isDean = course.instructor.includes('Dr. Kim Joy') || course.instructor.includes('HR. KIM');

  return (
    <div className="min-h-screen bg-slate-50 pb-24 animate-fade-in relative">
      {/* PDF Preview Overlay */}
      <PdfPreviewOverlay />

      {/* Edit Modal (Admin Only) */}
      {showEditModal && isAdmin && (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl relative animate-scale-in">
                <button onClick={() => setShowEditModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X size={20}/></button>
                <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center">
                    <Edit2 size={20} className="mr-2 text-blue-600"/> 编辑课程信息
                </h3>
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1.5">课程名称</label>
                        <input 
                            type="text" 
                            value={editForm.title}
                            onChange={(e) => setEditForm({...editForm, title: e.target.value})}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-900"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1.5">讲师姓名</label>
                        <input 
                            type="text" 
                            value={editForm.instructor}
                            onChange={(e) => setEditForm({...editForm, instructor: e.target.value})}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-900"
                        />
                    </div>
                    
                    <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1.5">所属分类</label>
                        <select 
                            value={editForm.category}
                            onChange={(e) => setEditForm({...editForm, category: e.target.value as TheologyCategory})}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-900 appearance-none"
                        >
                            {Object.values(TheologyCategory).map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1.5">课程封面</label>
                        <div 
                            onClick={() => imageInputRef.current?.click()}
                            className="w-full h-32 bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center text-slate-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 transition-all cursor-pointer overflow-hidden relative group"
                        >
                            {editForm.thumbnailPreview || editForm.thumbnail ? (
                                <>
                                    <img src={editForm.thumbnailPreview || editForm.thumbnail} alt="Preview" className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <div className="bg-white/20 backdrop-blur p-2 rounded-full text-white">
                                            <RefreshCw size={20} />
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <ImageIcon size={24} className="mb-2"/>
                                    <span className="text-[10px]">点击更换图片</span>
                                </>
                            )}
                        </div>
                        <input type="file" accept="image/*" ref={imageInputRef} className="hidden" onChange={handleImageChange} />
                    </div>
                    <button 
                        onClick={handleSaveEdit}
                        className="w-full bg-blue-900 text-white font-bold py-3.5 rounded-xl shadow-lg mt-2 active:scale-95 transition-transform flex items-center justify-center"
                    >
                        <Save size={18} className="mr-2" />
                        保存修改
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* 1. Sticky Header */}
      <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-100 px-4 pt-safe-top pb-3 flex items-center justify-between shadow-sm">
         <div className="flex items-center">
            <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-slate-100 text-slate-600 transition">
               <ChevronLeft size={24} />
            </button>
            <h1 className="ml-1 font-bold text-slate-900 text-base truncate max-w-[200px]">{course.title}</h1>
         </div>
         <div className="flex items-center space-x-1 relative">
            <button 
               onClick={handleShare}
               className="p-2 rounded-full hover:bg-slate-100 text-slate-500 active:bg-slate-200 transition"
            >
               <Share2 size={20} />
            </button>
            <button 
               onClick={() => setShowMenu(!showMenu)}
               className={`p-2 rounded-full transition ${showMenu ? 'bg-blue-50 text-blue-600' : 'hover:bg-slate-100 text-slate-500'}`}
            >
               <MoreHorizontal size={20} />
            </button>

            {/* --- Dropdown Menu --- */}
            {showMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)}></div>
                <div className="absolute top-full right-0 mt-2 w-48 bg-white rounded-xl shadow-2xl border border-slate-100 py-1 z-50 animate-in fade-in zoom-in-95 duration-200 origin-top-right">
                   
                   {/* Admin Only Edit Option */}
                   {isAdmin && (
                       <button 
                         onClick={() => { setShowEditModal(true); setShowMenu(false); }}
                         className="flex items-center w-full px-4 py-3 text-sm font-bold text-blue-700 hover:bg-blue-50 transition active:bg-blue-100"
                       >
                          <Edit2 size={16} className="mr-3 text-blue-500" />
                          编辑课程
                       </button>
                   )}
                   {isAdmin && <div className="my-1 border-t border-slate-100"></div>}

                   <button 
                     onClick={toggleFavorite}
                     className="flex items-center w-full px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 transition active:bg-slate-100"
                   >
                      <Heart size={16} className={`mr-3 ${isFavorite ? 'fill-rose-500 text-rose-500' : 'text-slate-400'}`} />
                      {isFavorite ? '取消收藏' : '收藏课程'}
                   </button>
                   <button 
                     onClick={handleCopyLink}
                     className="flex items-center w-full px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 transition active:bg-slate-100"
                   >
                      <LinkIcon size={16} className="mr-3 text-slate-400" />
                      复制链接
                   </button>
                   <div className="my-1 border-t border-slate-100"></div>
                   <button 
                     onClick={handleReport}
                     className="flex items-center w-full px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 transition active:bg-slate-100"
                   >
                      <Flag size={16} className="mr-3 text-slate-400" />
                      报告问题
                   </button>
                </div>
              </>
            )}
         </div>
      </div>

      {/* Toast Notification for Copy Link */}
      {showShareToast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-slate-800/90 text-white px-4 py-2 rounded-full text-xs font-bold shadow-lg z-50 animate-fade-in backdrop-blur-sm flex items-center">
           <CheckCircle size={14} className="mr-2 text-emerald-400"/>
           链接已复制
        </div>
      )}

      {/* Toast Notification for Download */}
      {showDownloadToast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-blue-900/90 text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-lg z-[70] animate-fade-in backdrop-blur-sm flex items-center w-64">
           <div className="mr-3 relative">
              <CheckCircle size={18} className="text-emerald-300" />
           </div>
           <div className="flex-1">
              <p className="truncate mb-0.5">{downloadFileName}</p>
              <p className="text-[10px] opacity-70">已加入离线缓存</p>
           </div>
        </div>
      )}

      {/* Report Modal */}
      {reportModal && (
        <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-fade-in max-w-md mx-auto" onClick={() => setReportModal(false)}>
          <div className="bg-white w-full rounded-3xl p-6 shadow-2xl animate-scale-in" onClick={(e) => e.stopPropagation()}>
            {!reportSubmitted ? (
              <>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-base font-bold text-slate-900">举报该课程</h3>
                  <button onClick={() => setReportModal(false)} className="p-1 text-slate-400"><X size={18} /></button>
                </div>
                <p className="text-[12px] text-slate-500 mb-4">请选择举报原因，教务处将在 1–3 个工作日内核实处理。</p>
                <div className="space-y-2 mb-4">
                  {['内容不准确或错误', '不当或冒犯性内容', '版权或盗用问题', '视频/资料无法打开', '其他问题'].map(r => (
                    <button
                      key={r}
                      onClick={() => setReportReason(r)}
                      className="w-full text-left px-4 py-3 rounded-xl border text-sm font-semibold transition"
                      style={{
                        background: reportReason === r ? '#04285F' : '#FFFFFF',
                        color: reportReason === r ? '#FFFFFF' : '#1F2937',
                        borderColor: reportReason === r ? '#04285F' : '#E5E7EB',
                      }}
                    >{r}</button>
                  ))}
                </div>
                <div className="flex" style={{ gap: 8 }}>
                  <button onClick={() => setReportModal(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm">取消</button>
                  <button onClick={submitReport} disabled={!reportReason} className="flex-1 py-3 bg-rose-600 text-white rounded-xl font-bold text-sm disabled:opacity-50">提交举报</button>
                </div>
              </>
            ) : (
              <div className="text-center py-4">
                <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3"><CheckCircle size={28} /></div>
                <h3 className="text-base font-bold text-slate-900 mb-1">已收到您的反馈</h3>
                <p className="text-[12px] text-slate-500 mb-5">我们将在 1–3 个工作日内核实并回复结果。</p>
                <button onClick={() => setReportModal(false)} className="w-full bg-blue-900 text-white py-3 rounded-xl text-sm font-bold">关闭</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. Video Player Area */}
      <div className="w-full aspect-video bg-slate-900 relative group overflow-hidden shadow-lg">
         {!isPlaying ? (
            <>
               <img src={course.thumbnail} alt="Course Cover" className="w-full h-full object-cover opacity-60 group-hover:opacity-40 transition-opacity duration-500" />
               <div className="absolute inset-0 flex flex-col items-center justify-center text-white p-4 text-center">
                  <button 
                    onClick={() => { setIsPlaying(true); setIsPaused(false); setShowControls(true); }}
                    className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center border-2 border-white/50 mb-4 group-hover:scale-110 transition-transform shadow-lg"
                  >
                    <Play size={32} fill="white" className="ml-1" />
                  </button>
                  <p className="text-xs font-bold tracking-wider uppercase opacity-90 drop-shadow-md">点击播放: {currentLesson?.title || '该课程暂无可播放内容'}</p>
               </div>
               
               {/* Progress overlay */}
               {progressPct > 0 && (
                 <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                    <div className="h-full bg-blue-500" style={{width: `${progressPct}%`}}></div>
                 </div>
               )}
            </>
         ) : (
            <div 
                className="w-full h-full flex flex-col items-center justify-center bg-black text-white relative group/player"
                onClick={() => setShowControls(!showControls)}
            >
               {/* Top Bar - Title & Close */}
               <div 
                  className={`absolute top-0 left-0 right-0 p-4 flex justify-between items-start z-20 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}
                  onClick={(e) => e.stopPropagation()}
               >
                   <span className="text-xs font-medium bg-black/40 px-2 py-1 rounded backdrop-blur-md border border-white/10">
                     {currentLesson?.title || ''}
                   </span>
                   <button 
                      onClick={() => setIsPlaying(false)}
                      className="p-2 bg-black/40 backdrop-blur-md rounded-full text-white/80 hover:bg-white/20 transition"
                   >
                      <X size={20} />
                   </button>
               </div>

               {/* Center Click Area for Play/Pause Interaction */}
               <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none">
                  {/* Play Icon (When Paused) */}
                  {isPaused && (
                     <button 
                        className="w-16 h-16 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center border-2 border-white/50 animate-scale-in pointer-events-auto cursor-pointer hover:scale-105 transition-transform" 
                        onClick={(e) => { e.stopPropagation(); setIsPaused(false); setShowControls(true); }}
                     >
                        <Play size={32} fill="white" className="ml-1" />
                     </button>
                  )}
                  
                  {/* Pause Icon (When Playing + Controls Visible) */}
                  {!isPaused && showControls && (
                     <button 
                        className="w-16 h-16 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center border-2 border-white/50 animate-scale-in pointer-events-auto cursor-pointer hover:scale-105 transition-transform" 
                        onClick={(e) => { e.stopPropagation(); setIsPaused(true); }}
                     >
                        <PauseCircle size={32} fill="white" />
                     </button>
                  )}

                  {/* Loading Spinner (When Playing) */}
                  {!isPaused && (
                     <div className="absolute inset-0 flex items-center justify-center -z-10">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500/50 opacity-30"></div>
                     </div>
                  )}
               </div>

               {/* Bottom Controls overlay */}
               <div 
                  className={`absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent transition-opacity duration-300 ${showControls || isPaused ? 'opacity-100' : 'opacity-0'}`}
                  onClick={(e) => e.stopPropagation()}
               >
                  <div className="w-full h-1 bg-white/30 rounded-full mb-4 overflow-hidden cursor-pointer group/progress">
                     <div className={`h-full bg-blue-500 relative ${isPaused ? '' : 'w-1/3'}`} style={{ width: isPaused ? '33%' : undefined }}>
                        {!isPaused && <div className="absolute top-0 left-0 bottom-0 right-0 bg-blue-400/30 animate-pulse"></div>}
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-sm scale-0 group-hover/progress:scale-100 transition-transform"></div>
                     </div>
                  </div>
                  <div className="flex justify-between items-center text-white/90">
                     <div className="flex items-center space-x-4">
                        <button onClick={() => setIsPaused(!isPaused)} className="hover:text-blue-400 transition">
                           {isPaused ? <PlayCircle size={24} /> : <PauseCircle size={24} />}
                        </button>
                        <span className="text-xs font-mono">04:20 / {currentLesson?.duration || '--:--'}</span>
                     </div>
                  </div>
               </div>
            </div>
         )}
      </div>

      {/* 3. Course Meta Info */}
      <div className="bg-white p-5 mb-2 border-b border-slate-100">
         <div className="mb-3">
            {/* Updated Title Layout: Title then Badge */}
            <div className="flex items-center flex-wrap gap-2">
               <h2 className="text-xl font-bold text-slate-900 leading-tight">{course.title}</h2>
               <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 whitespace-nowrap align-middle">{course.category}</span>
            </div>
         </div>
         
         <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-slate-900 text-sm">课程简介</h3>
         </div>
         <div className="mb-4">
             <p className={`text-sm text-slate-600 leading-relaxed transition-all duration-300 ${isDescExpanded ? '' : 'line-clamp-3'}`}>
                {details.description}
             </p>
             {details.description && details.description.length > 60 && (
                 <button 
                    onClick={() => setIsDescExpanded(!isDescExpanded)}
                    className="mt-1 text-xs font-bold text-blue-600 flex items-center hover:text-blue-700 active:scale-95 transition-transform"
                 >
                    {isDescExpanded ? '收起' : '展开全文'}
                    {isDescExpanded ? <ChevronUp size={12} className="ml-1"/> : <ChevronDown size={12} className="ml-1"/>}
                 </button>
             )}
         </div>
         
         <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
            <div className="flex items-center space-x-3">
               <img src={`https://ui-avatars.com/api/?name=${course.instructor}&background=0f172a&color=fff`} className="w-9 h-9 rounded-full border-2 border-white shadow-sm" alt="Instructor"/>
               <div>
                  <p className="text-xs font-bold text-slate-900">{course.instructor}</p>
                  <p className="text-[10px] text-slate-500">{isDean ? 'AMAS 院长' : 'AMAS 特约讲师'}</p>
               </div>
            </div>
            <div className="text-right pl-4 border-l border-slate-200">
               <p className="text-[10px] text-slate-400">学习进度</p>
               <p className="text-sm font-bold text-blue-600">{completedCount}/{totalLessons} 课时</p>
            </div>
         </div>
      </div>

      {/* 4. Tabs Navigation */}
      <div className="sticky top-[60px] z-30 bg-white border-b border-slate-200 shadow-sm flex text-sm font-bold text-slate-500">
         <button 
           onClick={() => setActiveTab('syllabus')}
           className={`flex-1 py-3 relative transition-colors ${activeTab === 'syllabus' ? 'text-blue-900' : 'hover:text-slate-800'}`}
         >
           课程目录
           {activeTab === 'syllabus' && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-blue-900 rounded-full"></div>}
         </button>
         <button 
           onClick={() => setActiveTab('intro')}
           className={`flex-1 py-3 relative transition-colors ${activeTab === 'intro' ? 'text-blue-900' : 'hover:text-slate-800'}`}
         >
           详情介绍
           {activeTab === 'intro' && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-blue-900 rounded-full"></div>}
         </button>
         <button 
           onClick={() => setActiveTab('materials')}
           className={`flex-1 py-3 relative transition-colors ${activeTab === 'materials' ? 'text-blue-900' : 'hover:text-slate-800'}`}
         >
           学习资料
           {activeTab === 'materials' && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-blue-900 rounded-full"></div>}
         </button>
      </div>

      {/* 5. Tab Content */}
      <div className="p-4 min-h-[300px]">
         
         {/* --- Syllabus Tab --- */}
         {activeTab === 'syllabus' && (
            <div className="space-y-3 animate-fade-in">
               <div className="flex justify-between items-center mb-2 px-1">
                  <span className="text-xs font-bold text-slate-500">共 {syllabus.length} 节课程</span>
                  <span className="text-xs text-slate-400 font-semibold">已完成 {completedCount} / {syllabus.length}</span>
               </div>
               {syllabus.map((lesson: any, idx: number) => {
                  const isActive = currentLesson?.id === lesson.id;
                  const status = statusOf(lesson, idx);
                  const isDone = status === 'completed';
                  return (
                    <div
                      key={lesson.id}
                      onClick={() => handleLessonClick(lesson, idx)}
                      className={`flex items-center p-3.5 rounded-xl border transition-all cursor-pointer ${
                         isActive
                           ? 'bg-blue-50/80 border-blue-400 ring-1 ring-blue-400/20 shadow-md'
                           : status === 'locked'
                             ? 'bg-slate-50 border-slate-100 opacity-70 hover:opacity-100'
                             : 'bg-white border-slate-200 hover:border-blue-300 hover:shadow-sm'
                      }`}
                    >
                       <div className="mr-3 shrink-0 relative">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold border shadow-sm transition-colors ${
                             isActive
                               ? 'bg-blue-600 text-white border-blue-600'
                               : isDone
                                 ? 'bg-emerald-100 text-emerald-600 border-emerald-200'
                                 : 'bg-white text-slate-400 border-slate-200'
                          }`}>
                             {isDone ? <CheckCircle size={12} /> : (isActive ? <Play size={10} fill="white"/> : idx + 1)}
                          </div>
                          {/* Connector Line */}
                          {idx !== syllabus.length - 1 && (
                             <div className="absolute top-7 left-1/2 -translate-x-1/2 w-px h-6 bg-slate-100 -z-10"></div>
                          )}
                       </div>

                       <div className="flex-1">
                          <h3 className={`text-sm font-bold mb-1 leading-tight ${isActive ? 'text-blue-900' : (status === 'locked' ? 'text-slate-400' : 'text-slate-800')}`}>
                             {lesson.title}
                          </h3>
                          <div className="flex items-center space-x-3 text-[10px]">
                             <span className={`flex items-center ${isActive ? 'text-blue-600' : 'text-slate-400'}`}>
                               <Clock size={10} className="mr-1"/> {lesson.duration}
                             </span>
                             {lesson.isFree && <span className="text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">免费试听</span>}
                             {isActive && <span className="text-blue-600 font-bold animate-pulse">播放中...</span>}
                          </div>
                       </div>

                       {/* Completion toggle — tap to mark done / undone (not for locked). */}
                       {status === 'locked' ? (
                          <div className="ml-3 shrink-0"><Lock size={16} className="text-slate-300" /></div>
                       ) : (
                          <button
                            onClick={(e) => toggleComplete(lesson, idx, e)}
                            aria-label={isDone ? '标记为未完成' : '标记为已完成'}
                            className={`ml-3 shrink-0 w-7 h-7 rounded-full flex items-center justify-center border transition-all active:scale-90 ${
                               isDone
                                 ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm'
                                 : 'bg-white text-slate-300 border-slate-200 hover:border-emerald-400 hover:text-emerald-500'
                            }`}
                          >
                             <CheckCircle size={16} />
                          </button>
                       )}
                    </div>
                  );
               })}
            </div>
         )}

         {/* --- Introduction Tab --- */}
         {activeTab === 'intro' && (
            <div className="space-y-4 animate-fade-in">
               <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
                  <h3 className="font-bold text-slate-900 text-sm mb-3 flex items-center">
                     <CheckCircle size={16} className="mr-2 text-emerald-600"/>
                     课程目标
                  </h3>
                  <ul className="space-y-3">
                     {details.objectives.map((obj: string, i: number) => (
                        <li key={i} className="flex items-start text-sm text-slate-600">
                           <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-2 mr-2.5 shrink-0"></div>
                           <span className="leading-6">{obj}</span>
                        </li>
                     ))}
                  </ul>
               </div>

               <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
                  <h3 className="font-bold text-slate-900 text-sm mb-3">适用人群</h3>
                  <div className="flex items-start text-sm text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100">
                      <BookOpen size={16} className="text-blue-500 mr-2 shrink-0 mt-0.5" />
                      <span className="leading-6">{details.targetAudience}</span>
                  </div>
               </div>
            </div>
         )}

         {/* --- Materials Tab --- */}
         {activeTab === 'materials' && (
            <div className="space-y-3 animate-fade-in">
               {/* Hidden picker for admin uploads */}
               <input ref={fileInputRef} type="file" className="hidden" onChange={handlePickUpload} />

               {/* Admin upload control */}
               {isAdmin && (
                  <button
                     onClick={() => fileInputRef.current?.click()}
                     disabled={filesBusy || !isCoursesBackendConfigured()}
                     className="w-full flex items-center justify-center p-3 mb-1 rounded-xl border-2 border-dashed border-blue-200 text-blue-700 bg-blue-50/50 hover:bg-blue-50 transition disabled:opacity-50 active:scale-[0.99]"
                  >
                     <Upload size={16} className="mr-2" />
                     <span className="text-sm font-bold">{filesBusy ? '处理中…' : '上传课程资料'}</span>
                  </button>
               )}

               {serverFiles.length > 0 ? (
                  <>
                     <div className="bg-blue-50 p-3 rounded-lg flex items-start mb-1 border border-blue-100">
                        <AlertCircle size={16} className="text-blue-600 shrink-0 mt-0.5 mr-2" />
                        <p className="text-xs text-blue-800 leading-relaxed">点击右侧按钮下载课程资料。</p>
                     </div>
                     {serverFiles.map((f) => {
                        const isDownloaded = downloaded.has(f.filename);
                        return (
                           <div key={f.id} className="flex items-center p-4 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-blue-300 hover:shadow-md transition-all group">
                              <div className="w-10 h-10 bg-rose-50 rounded-lg flex items-center justify-center text-rose-500 shrink-0 mr-3">
                                 <FileText size={20} />
                              </div>
                              <div className="flex-1 min-w-0">
                                 <div className="flex items-center" style={{ gap: 6 }}>
                                    <h4 className="text-sm font-bold text-slate-800 truncate">{f.filename}</h4>
                                    {isDownloaded && <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full uppercase tracking-wider whitespace-nowrap">已下载</span>}
                                 </div>
                                 <p className="text-[10px] text-slate-400 mt-0.5">{formatSize(f.sizeBytes)} • {f.mime}</p>
                              </div>
                              <button
                                 onClick={() => handleRealDownload(f)}
                                 disabled={filesBusy}
                                 aria-label={`下载 ${f.filename}`}
                                 className="p-2 bg-slate-50 text-slate-400 rounded-full hover:bg-blue-100 hover:text-blue-600 transition disabled:opacity-50"
                              >
                                 <Download size={18} />
                              </button>
                           </div>
                        );
                     })}
                  </>
               ) : (
                  // No real files yet. Show the syllabus sample list (muted, not
                  // downloadable) so the tab isn't empty, and say so plainly.
                  <>
                     <div className="bg-slate-50 p-3 rounded-lg flex items-start mb-1 border border-slate-100">
                        <AlertCircle size={16} className="text-slate-400 shrink-0 mt-0.5 mr-2" />
                        <p className="text-xs text-slate-500 leading-relaxed">
                           {isAdmin ? '该课程暂无可下载资料，点击上方按钮上传。' : '该课程暂无可下载资料。以下为资料示例。'}
                        </p>
                     </div>
                     {(details.materials || []).map((file: any, i: number) => (
                        <div key={i} className="flex items-center p-4 bg-white rounded-xl border border-slate-100 opacity-60">
                           <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center text-slate-300 shrink-0 mr-3">
                              <FileText size={20} />
                           </div>
                           <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-bold text-slate-500 truncate">{file.title}</h4>
                              <p className="text-[10px] text-slate-400 mt-0.5">{file.size} • 示例</p>
                           </div>
                           <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">示例</span>
                        </div>
                     ))}
                  </>
               )}
            </div>
         )}

      </div>

      {/* 6. Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 pb-safe-area shadow-[0_-4px_10px_rgba(0,0,0,0.03)] z-50 flex items-center space-x-4">
         <div className="flex-1">
            <p className="text-[10px] text-slate-400 mb-1 flex justify-between">
               <span>当前进度</span>
               <span className="font-bold text-slate-700">{progressPct}%</span>
            </p>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
               <div className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full" style={{width: `${progressPct}%`}}></div>
            </div>
         </div>
         <button 
            onClick={() => {
               if (isPlaying) {
                  setIsPaused(!isPaused);
               } else {
                  setIsPlaying(true);
                  setIsPaused(false);
               }
            }}
            className="bg-blue-900 text-white px-6 py-3 rounded-xl font-bold text-sm shadow-lg shadow-blue-900/20 hover:bg-blue-800 transition active:scale-95 flex items-center"
         >
            {isPlaying && !isPaused ? <PauseCircle size={18} className="mr-2"/> : <PlayCircle size={18} className="mr-2" />}
            {isPlaying ? (isPaused ? '继续播放' : '暂停学习') : (progressPct > 0 ? '继续学习' : '开始学习')}
         </button>
      </div>
    </div>
  );
};

export default CourseDetailView;
