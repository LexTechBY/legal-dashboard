import React, { useState, useMemo, useRef } from 'react';
import { 
  FileText, Upload, Download, 
  Info, Loader2, Scale, Sparkles, CheckCircle2 
} from 'lucide-react';
import mammoth from 'mammoth';
import PizZip from 'pizzip';
import { saveAs } from 'file-saver';

export default function App() {
  const [htmlContent, setHtmlContent] = useState('');
  const [originalBuffer, setOriginalBuffer] = useState(null); 
  const [formData, setFormData] = useState({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeField, setActiveField] = useState(null);
  
  const fileInputRef = useRef(null);

  const resetTemplate = () => {
    setHtmlContent('');
    setOriginalBuffer(null);
    setFormData({});
    setActiveField(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsProcessing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      setOriginalBuffer(arrayBuffer); 
      const result = await mammoth.convertToHtml({ arrayBuffer });
      setHtmlContent(result.value || '');
      setFormData({}); 
    } catch (err) {
      alert("Ошибка при чтении DOCX");
    } finally {
      setIsProcessing(false);
    }
  };

  const placeholders = useMemo(() => {
    if (!htmlContent) return [];
    const regex = /\{([^{}|]+)(?:\|([^}]+))?\}/g;
    const matches = [];
    const seen = new Set();
    let match;
    while ((match = regex.exec(htmlContent)) !== null) {
      if (!seen.has(match[1])) {
        seen.add(match[1]);
        matches.push({ full: match[0], key: match[1], comment: match[2] || "" });
      }
    }
    return matches;
  }, [htmlContent]);

  const handleBulkPaste = (e, startIndex) => {
    const pasteData = e.clipboardData.getData('text');
    const lines = pasteData.split(/\r?\n/).map(line => line.trim()).filter(line => line !== "");
    if (lines.length > 1) {
      e.preventDefault(); 
      const newFormData = { ...formData };
      lines.forEach((line, index) => {
        const targetPlaceholder = placeholders[startIndex + index];
        if (targetPlaceholder) { newFormData[targetPlaceholder.key] = line; }
      });
      setFormData(newFormData);
    }
  };

  const exportOriginalWithData = async () => {
    if (!originalBuffer) return;
    setIsProcessing(true);
    try {
      const zip = new PizZip(originalBuffer);
      const xmlFiles = Object.keys(zip.files).filter(name => 
        name.match(/^word\/(document|header|footer|footnotes|endnotes)\d*\.xml$/)
      );

      xmlFiles.forEach((fileName) => {
        let content = zip.files[fileName].asText();
        content = content.replace(/<w:proofErr [^>]*\/>/g, '').replace(/<w:noProof[^>]*\/>/g, '').replace(/<w:lang [^>]*\/>/g, '');
        const sorted = [...placeholders].sort((a, b) => b.full.length - a.full.length);
        sorted.forEach(({ full, key }) => {
          const fuzzyPattern = full.split('').map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(?:<[^>]+>)*');
          const regex = new RegExp(fuzzyPattern, 'g');
          if (regex.test(content)) {
            const val = (formData[key] || full).toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            content = content.replace(regex, val);
          }
        });
        zip.file(fileName, content);
      });

      const out = zip.generate({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
      saveAs(out, `Lumina_Export_${Date.now()}.docx`);
    } catch (err) {
      alert("Ошибка сборки");
    } finally {
      setIsProcessing(false);
    }
  };

  const getProcessedHtmlPreview = () => {
    if (!htmlContent) return "";
    let finalHtml = htmlContent;
    placeholders.forEach(({ full, key }) => {
      const value = formData[key];
      const filledStyle = `mx-0.5 px-2 py-0.5 bg-gradient-to-r from-teal-50 to-emerald-50 text-teal-900 font-bold rounded-md border-b-2 border-teal-500 shadow-sm transition-all`;
      const emptyStyle = `mx-0.5 px-1.5 py-0.5 bg-teal-50/30 text-teal-600 border border-teal-200 border-dashed rounded-md font-medium transition-all`;
      const replacement = `<span id="target-${key}" class="${value ? filledStyle : emptyStyle}">${value || full}</span>`;
      finalHtml = finalHtml.split(full).join(replacement);
    });
    return finalHtml;
  };

  const isComplete = placeholders.length > 0 && placeholders.every(p => formData[p.key]);

  return (
    <div className="h-screen w-screen bg-[#F1F5F9] flex overflow-hidden font-sans text-slate-900">
      
      {/* САЙДБАР С ОБНОВЛЕННЫМИ КНОПКАМИ */}
      <aside className="w-[420px] bg-white border-r border-slate-200 flex flex-col shadow-2xl z-20">
        
        {/* Брендинг и Компактный Импорт (Floating Design) */}
        <div className="p-6 bg-[#0D2E2E] text-white relative overflow-hidden flex flex-col items-center shrink-0">
          <div className="absolute -top-12 -left-12 w-32 h-32 bg-teal-500/10 rounded-full blur-3xl"></div>
          
          <div className="w-full flex items-center justify-between mb-6 relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-br from-teal-400 to-cyan-600 rounded-lg flex items-center justify-center shadow-lg">
                <Sparkles size={18} />
              </div>
              <div>
                <h2 className="text-lg font-bold italic leading-none text-white">Lumina <span className="text-teal-400">Pure</span></h2>
                <p className="text-[8px] text-teal-200/50 font-bold uppercase tracking-widest mt-1">Legal Automator</p>
              </div>
            </div>
            {originalBuffer && (
              <button onClick={resetTemplate} className="p-2 hover:bg-red-500/20 text-red-300 rounded-lg transition-colors" title="Очистить">
                <FileText size={14} />
              </button>
            )}
          </div>

          <button 
            onClick={() => fileInputRef.current.click()} 
            className="relative z-10 w-[85%] bg-white/5 hover:bg-white/10 text-teal-100 border border-teal-500/30 py-2.5 rounded-full font-bold text-[10px] uppercase tracking-[2px] transition-all flex items-center justify-center gap-2 backdrop-blur-md active:scale-95"
          >
            <Upload size={14} className="text-teal-400" /> Импорт шаблона
          </button>
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".docx" className="hidden" />
        </div>

        {/* ЗОНА МЕТОК (УВЕЛИЧЕНА) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-white scrollbar-thin scrollbar-thumb-slate-100">
          {placeholders.map(({ key, comment }, index) => (
            <div key={key}>
              <label className={`text-[9px] font-black uppercase tracking-widest block mb-1 px-1 transition-colors ${activeField === key ? 'text-teal-600' : 'text-slate-400'}`}>
                {key.replace(/_/g, ' ')}
              </label>
              <input type="text" 
                     onFocus={() => { setActiveField(key); document.getElementById(`target-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}
                     onPaste={(e) => handleBulkPaste(e, index)}
                     className={`w-full bg-slate-50 border rounded-xl px-4 py-3 text-sm outline-none transition-all ${activeField === key ? 'border-teal-400 ring-2 ring-teal-500/5 bg-white' : 'border-slate-100'}`}
                     placeholder="Введите данные..." 
                     value={formData[key] || ''} 
                     onChange={(e) => setFormData({...formData, [key]: e.target.value})} />
              {comment && <div className="flex gap-2 mt-2 px-1"><Info size={11} className="text-teal-500 shrink-0 mt-0.5 opacity-60" /><p className="text-[10px] text-slate-400 italic leading-snug">{comment}</p></div>}
            </div>
          ))}
          {placeholders.length === 0 && (
             <div className="h-full flex flex-col items-center justify-center text-center opacity-10 italic">
                <FileText size={40} className="mb-4" />
                <p className="text-[10px] font-bold uppercase tracking-widest">Ожидание файла</p>
             </div>
          )}
        </div>

        {/* ЭКСПОРТ (Элегантная Пилюля) */}
        <div className="p-6 border-t border-slate-100 bg-white flex justify-center shrink-0">
          <button 
            onClick={exportOriginalWithData} 
            disabled={!originalBuffer || isProcessing} 
            className="w-[90%] h-12 bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-500 hover:to-cyan-600 text-white rounded-full font-black text-[10px] uppercase tracking-[2px] flex items-center justify-center gap-3 shadow-lg shadow-teal-200/50 transition-all active:scale-[0.98] disabled:opacity-30 disabled:grayscale"
          >
            {isProcessing ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <>
                <Download size={16} />
                <span>Готовый документ</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* ПРЕВЬЮ */}
      <main className="flex-1 overflow-y-auto relative p-12 scroll-smooth bg-[#F1F5F9]">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-teal-200/10 rounded-full blur-[120px] pointer-events-none"></div>
        <div className="max-w-4xl mx-auto relative z-10">
            <div className="w-full min-h-[1120px] p-[25mm] relative rounded-sm border border-white/80 overflow-hidden bg-white bg-gradient-to-tr from-[#F0FDFA] via-white to-[#F5F3FF] shadow-2xl">
                <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-teal-400/[0.05] rounded-full blur-[100px] pointer-events-none"></div>
                
                <div className="flex justify-between items-center mb-10 border-b border-teal-100/30 pb-6 relative z-10">
                    <div className="flex items-center gap-2">
                        <Scale size={18} className="text-teal-600 opacity-30" />
                        <span className="text-[9px] font-bold tracking-[4px] uppercase text-teal-800/30">Document Preview</span>
                    </div>
                    <CheckCircle2 size={18} className={isComplete ? "text-emerald-500" : "text-slate-200"} />
                </div>
                
                <style>{`
                  .document-preview { font-family: 'Times New Roman', serif; line-height: 1.8; text-align: justify; color: #1e293b; font-size: 12pt; position: relative; z-index: 10; }
                  .document-preview p { margin-bottom: 1.2em; }
                  .document-preview span { transition: all 0.2s ease; box-shadow: 0 1px 2px rgba(20, 184, 166, 0.05); }
                `}</style>

                {htmlContent ? (
                    <div className="document-preview transition-all duration-700" dangerouslySetInnerHTML={{ __html: getProcessedHtmlPreview() }} />
                ) : (
                    <div className="h-[800px] flex flex-col items-center justify-center opacity-10">
                         <span className="text-3xl font-thin tracking-[20px] uppercase text-teal-900">Lumina</span>
                    </div>
                )}
            </div>
        </div>
      </main>
    </div>
  );
}