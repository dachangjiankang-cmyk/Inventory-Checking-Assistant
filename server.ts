import express from "express";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import path from "path";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // 增加 payload 限制以處理圖片上傳
  app.use(express.json({ limit: '10mb' }));

  // 健康檢查 API
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      hasKey: !!process.env.GEMINI_API_KEY,
      env: process.env.NODE_ENV 
    });
  });

  // AI 辨識 API 路由
  app.post("/api/process-image", async (req, res) => {
    try {
      const { base64Data, mode } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;

      if (!apiKey) {
        console.error("Missing GEMINI_API_KEY");
        return res.status(500).json({ error: "伺服器未偵測到 API 金鑰，請重新整理頁面或聯繫管理員。" });
      }

      const ai = new GoogleGenAI({ apiKey });
      // 使用更穩定的模型名稱
      const modelName = "gemini-flash-latest";
      
      const prompt = mode === 'system' 
        ? `你是一個專業的庫存盤點助手。請分析這張螢幕截圖，提取表格中的商品資訊。
           輸出格式必須是純 JSON 陣列，包含以下欄位：
           - "code": 商品代號 (第一欄)
           - "name": 品名 (第三欄)
           - "systemStock": 庫存量 (第七欄，請轉為數字)
           範例：[{"code": "123", "name": "測試商品", "systemStock": 10}]
           只輸出 JSON，不要有其他文字。`
        : `請辨識這張照片中的商品條碼數字。
           輸出格式必須是純 JSON 物件：{"code": "條碼數字"}
           只輸出 JSON，不要有其他文字。`;

      const result = await ai.models.generateContent({
        model: modelName,
        contents: [{
          parts: [
            { text: prompt },
            { inlineData: { mimeType: "image/jpeg", data: base64Data } }
          ]
        }],
        config: {
          temperature: 0.1, // 降低隨機性，讓格式更穩定
        }
      });

      const text = result.text;
      if (!text) {
        throw new Error("AI 回傳內容為空");
      }

      res.json({ text });
    } catch (error: any) {
      console.error("AI Processing Error:", error);
      // 傳回更具體的錯誤訊息
      const errorMessage = error.message || "未知錯誤";
      res.status(500).json({ error: `AI 處理失敗: ${errorMessage}` });
    }
  });

  // Vite 中間件
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
