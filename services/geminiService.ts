
import { GoogleGenAI } from "@google/genai";

let _ai: GoogleGenAI | null = null;
const getAi = (): GoogleGenAI | null => {
  if (_ai) return _ai;
  const apiKey = process.env.API_KEY;
  if (!apiKey) return null;
  _ai = new GoogleGenAI({ apiKey });
  return _ai;
};

export const generateTheologicalResponse = async (
  query: string,
  context: 'general' | 'devotional' | 'scripture' = 'general'
): Promise<string> => {
  try {
    let systemInstruction = "";

    switch (context) {
      case 'devotional':
        systemInstruction = "你是一所亚洲宣教神学院的精神导师和牧师。根据用户的输入提供简短、鼓励性的灵修思想。请包含一段经文引用。请使用简体中文回答。";
        break;
      case 'scripture':
        systemInstruction = "你是一个精准的圣经查询助手。请仅返回请求的经文内容，按节排列，格式为'节数 经文内容'。不要包含任何标题、解释、问候语或结束语。确保准确引用和合本圣经。";
        break;
      case 'general':
      default:
        systemInstruction = "你是亚洲宣教神学院 (AMAS) 的专家神学导师。准确回答学生的神学问题，并在适当的时候引用圣经文本和历史背景。语气要学术但平易近人。请使用简体中文回答。";
        break;
    }

    const ai = getAi();
    if (!ai) {
      return "提示：尚未配置 GEMINI_API_KEY，AI 功能暂不可用。请在项目根目录创建 .env 文件并填入 GEMINI_API_KEY=你的密钥 后重启 dev server。";
    }

    // Fixed: Updated to use recommended gemini-3-flash-preview model for text tasks
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: query,
      config: {
        systemInstruction: systemInstruction,
        temperature: context === 'scripture' ? 0.1 : 0.7, // Lower temperature for exact scripture retrieval
      }
    });

    return response.text || "抱歉，我现在无法生成回应。";
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    return "连接错误：无法连接到神学数据库，请稍后再试。";
  }
};
