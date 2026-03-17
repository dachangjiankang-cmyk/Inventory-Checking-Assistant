/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { 
  Camera, 
  Upload, 
  Plus, 
  Trash2, 
  Copy, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  FileText,
  Barcode,
  Monitor,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Types
interface InventoryItem {
  id: string;
  code: string;
  name: string;
  systemStock: number | '待盤點';
  actualStock: number | '待盤點';
  result: string;
}

const GEMINI_MODEL = "gemini-3-flash-preview";

export default function App() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadMode, setUploadMode] = useState<'system' | 'barcode'>('system');

  // Initialize Gemini
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

  const calculateResult = (system: number | '待盤點', actual: number | '待盤點'): string => {
    if (system === '待盤點' || actual === '待盤點') return '待盤點';
    const diff = actual - system;
    if (diff === 0) return '正負0，庫存正確';
    if (diff > 0) return `+${diff}，實際庫存有多`;
    return `${diff}，實際庫存有少`;
  };

  const addItem = () => {
    const newItem: InventoryItem = {
      id: Math.random().toString(36).substr(2, 9),
      code: '',
      name: '',
      systemStock: '待盤點',
      actualStock: '待盤點',
      result: '待盤點'
    };
    setItems([...items, newItem]);
  };

  const updateItem = (id: string, field: keyof InventoryItem, value: any) => {
    setItems(prev => prev.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };
        // Recalculate result if stock values change
        if (field === 'systemStock' || field === 'actualStock') {
          updated.result = calculateResult(updated.systemStock, updated.actualStock);
        }
        return updated;
      }
      return item;
    }));
  };

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setError(null);

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Data = (reader.result as string).split(',')[1];
        await processImage(base64Data, uploadMode);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setError('處理圖片時發生錯誤');
      setIsProcessing(false);
    }
  };

  const processImage = async (base64Data: string, mode: 'system' | 'barcode') => {
    try {
      const prompt = mode === 'system' 
        ? `你是一個專業的盤點助理。請從這張「庫存系統螢幕照片」中精準辨識所有商品列。
           
           視覺結構說明：
           - 畫面中央有一個表格，包含多行商品資料。
           - 第一欄 (商品代號)：長串數字或代碼 (例如：8710428009609, AC40358345)。
           - 第三欄 (品名)：商品的中文名稱，可能包含符號如 $ 或 ** (例如：$亞培倍力素...)。
           - 第七欄 (庫存量)：數字，可能包含小數點或負號 (例如：-5.0, 546.0, 22.0)。
           
           請擷取畫面上「所有」有效的商品列。
           請以 JSON 格式回傳，格式如下：
           [{"code": "條碼數字", "name": "品名文字", "systemStock": 數字}]
           
           注意事項：
           1. 庫存量請轉換為純數字 (例如 -5.0 轉為 -5)。
           2. 請忽略庫存與品名皆為空的空白預設列。
           3. 務必精確對應欄位，不要錯位。
           4. 如果完全辨識不到有效商品，請回傳空陣列 []。`
        : `你是一個專業的盤點助理。請從這張「實體商品條碼照片」中辨識條碼數字。
           請以 JSON 格式回傳，格式如下：
           {"code": "條碼數字"}
           如果辨識不到，請回傳空物件。`;

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{
          parts: [
            { text: prompt },
            { inlineData: { mimeType: "image/jpeg", data: base64Data } }
          ]
        }],
        config: {
          responseMimeType: "application/json"
        }
      });

      let resultText = response.text || (mode === 'system' ? '[]' : '{}');
      // 移除可能存在的 Markdown 標記
      resultText = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(resultText);

      if (mode === 'system') {
        const data = Array.isArray(parsed) ? parsed : [];
        const newItems: InventoryItem[] = data.map(item => ({
          id: Math.random().toString(36).substr(2, 9),
          code: String(item.code || ''),
          name: String(item.name || ''),
          systemStock: item.systemStock !== undefined ? Number(item.systemStock) : '待盤點',
          actualStock: '待盤點',
          result: '待盤點'
        }));
        
        if (newItems.length > 0) {
          setItems(prev => [...prev, ...newItems]);
        } else {
          setError('未能辨識到有效商品列，請確保照片清晰且包含欄位標題');
        }
      } else {
        const code = parsed.code || '';
        if (code) {
          const newItem: InventoryItem = {
            id: Math.random().toString(36).substr(2, 9),
            code: String(code),
            name: '',
            systemStock: '待盤點',
            actualStock: '待盤點',
            result: '待盤點'
          };
          setItems(prev => [...prev, newItem]);
        } else {
          setError('未能辨識到條碼，請重新拍攝');
        }
      }
    } catch (err) {
      console.error(err);
      setError('AI 辨識過程發生錯誤，請重試');
    } finally {
      setIsProcessing(false);
    }
  };

  const generateMarkdown = () => {
    let md = "| 商品代號 | 品名 | 系統庫存 | 實際盤點 | 盤點結果 |\n";
    md += "| :--- | :--- | :--- | :--- | :--- |\n";
    items.forEach(item => {
      md += `| ${item.code} | ${item.name} | ${item.systemStock} | ${item.actualStock} | ${item.result} |\n`;
    });
    return md;
  };

  const copyToClipboard = () => {
    const md = generateMarkdown();
    navigator.clipboard.writeText(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const clearAll = () => {
    if (window.confirm('確定要清空所有盤點資料嗎？')) {
      setItems([]);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <FileText className="w-8 h-8 text-blue-600" />
              藥局盤點核對助理
            </h1>
            <p className="text-gray-500 mt-1">專業、精準、高效率的庫存盤點解決方案</p>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={clearAll}
              className="px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              清空重置
            </button>
            <button 
              onClick={copyToClipboard}
              disabled={items.length === 0}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-all shadow-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? '已複製' : '複製 Markdown'}
            </button>
          </div>
        </header>

        {/* Upload Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <motion.div 
            whileHover={{ y: -2 }}
            className={`p-6 bg-white rounded-2xl shadow-sm border-2 transition-all cursor-pointer ${uploadMode === 'system' ? 'border-blue-500 bg-blue-50/30' : 'border-transparent'}`}
            onClick={() => {
              setUploadMode('system');
              fileInputRef.current?.click();
            }}
          >
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-xl ${uploadMode === 'system' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                <Monitor className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-lg">批次建立 (系統畫面)</h3>
                <p className="text-sm text-gray-500">上傳電腦庫存系統螢幕照片，自動擷取多筆品項資訊。</p>
              </div>
            </div>
          </motion.div>

          <motion.div 
            whileHover={{ y: -2 }}
            className={`p-6 bg-white rounded-2xl shadow-sm border-2 transition-all cursor-pointer ${uploadMode === 'barcode' ? 'border-blue-500 bg-blue-50/30' : 'border-transparent'}`}
            onClick={() => {
              setUploadMode('barcode');
              fileInputRef.current?.click();
            }}
          >
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-xl ${uploadMode === 'barcode' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                <Barcode className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-lg">單筆建檔 (實體條碼)</h3>
                <p className="text-sm text-gray-500">上傳實體商品條碼照片，自動讀取條碼數字。</p>
              </div>
            </div>
          </motion.div>
        </div>

        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept="image/*" 
          onChange={handleFileUpload}
        />

        {/* Error Message */}
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-red-50 border border-red-100 text-red-600 rounded-xl flex items-center gap-3"
          >
            <AlertCircle className="w-5 h-5" />
            {error}
          </motion.div>
        )}

        {/* Inventory Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-bottom border-gray-100">
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">商品代號</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">品名</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">系統庫存</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">實際盤點</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">盤點結果</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                <AnimatePresence initial={false}>
                  {items.map((item) => (
                    <motion.tr 
                      key={item.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="hover:bg-gray-50/50 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <input 
                          type="text" 
                          value={item.code}
                          onChange={(e) => updateItem(item.id, 'code', e.target.value)}
                          placeholder="代號"
                          className="w-full bg-transparent border-none focus:ring-0 font-mono text-sm"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <input 
                          type="text" 
                          value={item.name}
                          onChange={(e) => updateItem(item.id, 'name', e.target.value)}
                          placeholder="商品名稱"
                          className="w-full bg-transparent border-none focus:ring-0 text-sm"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <input 
                          type="text" 
                          value={item.systemStock}
                          onChange={(e) => {
                            const val = e.target.value === '' ? '待盤點' : Number(e.target.value);
                            updateItem(item.id, 'systemStock', isNaN(Number(val)) ? '待盤點' : val);
                          }}
                          className="w-20 bg-transparent border-none focus:ring-0 text-sm font-medium"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <input 
                          type="text" 
                          value={item.actualStock}
                          onChange={(e) => {
                            const val = e.target.value === '' ? '待盤點' : Number(e.target.value);
                            updateItem(item.id, 'actualStock', isNaN(Number(val)) ? '待盤點' : val);
                          }}
                          placeholder="輸入數量"
                          className="w-20 bg-blue-50/50 border-none focus:ring-2 focus:ring-blue-100 rounded px-2 py-1 text-sm font-bold text-blue-700"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-sm font-medium ${
                          item.result.includes('正確') ? 'text-green-600' : 
                          item.result.includes('多') ? 'text-blue-600' : 
                          item.result.includes('少') ? 'text-red-600' : 'text-gray-400'
                        }`}>
                          {item.result}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button 
                          onClick={() => removeItem(item.id)}
                          className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
                {items.length === 0 && !isProcessing && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                      <div className="flex flex-col items-center gap-2">
                        <Plus className="w-8 h-8 opacity-20" />
                        <p>尚無盤點資料，請上傳照片或點擊下方按鈕新增</p>
                      </div>
                    </td>
                  </tr>
                )}
                {isProcessing && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-blue-600">
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="w-8 h-8 animate-spin" />
                        <p className="font-medium">AI 正在辨識照片內容...</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          
          <div className="p-4 bg-gray-50 flex justify-center">
            <button 
              onClick={addItem}
              className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              手動新增品項
            </button>
          </div>
        </div>

        {/* Instructions */}
        <footer className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-gray-500">
          <div className="p-4 rounded-xl bg-white border border-gray-100">
            <h4 className="font-bold text-gray-700 mb-2">💡 提示一</h4>
            <p>拍攝系統畫面時，請確保光線充足且對焦清晰，儘量包含完整欄位標題。</p>
          </div>
          <div className="p-4 rounded-xl bg-white border border-gray-100">
            <h4 className="font-bold text-gray-700 mb-2">💡 提示二</h4>
            <p>拍攝實體條碼時，請讓條碼佔滿畫面中央，AI 會自動讀取數字。</p>
          </div>
          <div className="p-4 rounded-xl bg-white border border-gray-100">
            <h4 className="font-bold text-gray-700 mb-2">💡 提示三</h4>
            <p>輸入「實際盤點」數量後，系統會自動計算誤差並更新盤點結果。</p>
          </div>
        </footer>

        {/* Version Number */}
        <div className="mt-8 pb-4 text-center text-xs text-gray-400">
          Version 1.0
        </div>
      </div>
    </div>
  );
}
