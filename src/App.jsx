import React, { useState, useMemo, useRef } from 'react';
import { 
  FileText, Upload, Download, ClipboardList, 
  Info, Loader2, Wand2, CheckCircle2, Scale, Zap 
} from 'lucide-react';
import mammoth from 'mammoth';
import { saveAs } from 'file-saver';

export default function App() {
  const [htmlContent, setHtmlContent] = useState('');
  const [formData, setFormData] = useState({});
  const [isProcessing, setIsProcessing] = useState(false);
  const documentRef = useRef(null);
  const fileInputRef = useRef(null);

  // 1. ЗАГРУЗКА WORD -> HTML
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsProcessing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const options = {
        styleMap: [
          "p[style-name='Heading 1'] => h1:fresh",
          "p[style-name='Heading 2'] => h2:fresh",
          "p[style-name='List Paragraph'] => li:fresh"
        ]
      };
      const result = await mammoth.convertToHtml({ arrayBuffer }, options);
      setHtmlContent(result.value);
    } catch (err) {
      alert("Ошибка чтения файла");
    } finally {
      setIsProcessing(false);
    }
  };

  // 2. ПОИСК МЕТОК
  const placeholders = useMemo(() => {
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

  // Расчет прогресса заполнения
  const progress = useMemo(() => {
    if (placeholders.length === 0) return 0;
    const filled = placeholders.filter(p => formData[p.key] && formData[p.key].trim() !== '').length;
    return Math.round((filled / placeholders.length) * 100);
  }, [formData, placeholders]);

  // 3. СКРОЛЛИНГ К МЕТКЕ
  const scrollToPlaceholder = (key) => {
    const element = document.getElementById(`target-${key}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.add('highlight-flash');
      setTimeout(() => element.classList.remove('highlight-flash'), 2000);
    }
  };

  // 4. ГЕНЕРАЦИЯ ОБРАБОТАННОГО HTML
  const getProcessedHtml = () => {
    let finalHtml = htmlContent;
    placeholders.forEach(({ full, key }) => {
      const value = formData[key];
      const replacement = value 
        ? `<span id="target-${key}" class="data-filled">${value}</span>`
        : `<span id="target-${key}" class="data-empty">${full}</span>`;
      finalHtml = finalHtml.split(full).join(replacement);
    });
    return finalHtml;
  };

  const exportToDocx = () => {
    const content = getProcessedHtml();
    const header = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><style>
        body { font-family: 'Times New Roman', serif; font-size: 12pt; }
        p { margin-bottom: 10pt; text-align: justify; line-height: 1.2; }
        table { border-collapse: collapse; width: 100%; }
        td, th { border: 1px solid black; padding: 5pt; }
      </style></head><body>${content}</body></html>`;
    const blob = new Blob(['\ufeff', header], { type: 'application/msword' });
    saveAs(blob, `Lumina_Export.doc`);
  };

  return (
    // ГЛАВНЫЙ КОНТЕЙНЕР: Занимает весь экран и не скроллится сам
    <div className="h-screen w-screen overflow-hidden bg-slate-50 flex font-sans text-slate-800">
      
      {/* ЛЕВАЯ ПАНЕЛЬ (АНКЕТА): Фиксирована, имеет свой скролл */}
      <aside className="w-[420px] h-full bg-white border-r border-slate-200 flex flex-col z-30 shadow-2xl shrink-0">
        
        {/* Заголовок анкеты (Всегда сверху) */}
        <div className="p-8 bg-slate-900 text-white shrink-0">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
                        <Scale size={18} />
                    </div>
                    <h2 className="text-xl font-bold tracking-tight italic">Lumina Flow</h2>
                </div>
                <div className="text-[10px] bg-white/10 px-2 py-1 rounded-md font-mono text-indigo-300">v2.4</div>
            </div>
            
            {/* Прогресс-бар */}
            <div className="space-y-2">
                <div className="flex justify-between text-[10px] uppercase tracking-widest font-bold text-slate-400">
                    <span>Заполнение анкеты</span>
                    <span>{progress}%</span>
                </div>
                <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
                    <div 
                        className="h-full bg-indigo-500 transition-all duration-500" 
                        style={{ width: `${progress}%` }}
                    ></div>
                </div>
            </div>
        </div>

        {/* Список полей (Скроллится отдельно) */}
        <div className="flex-1 overflow-y-auto p-8 space-y-8 scrollbar-thin scrollbar-thumb-slate-200">
            {placeholders.length > 0 ? (
                placeholders.map(({ key, comment }) => (
                    <div key={key} className="group transition-all animate-in fade-in slide-in-from-left-4">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[2px] block mb-2 group-focus-within:text-indigo-600 transition-colors">
                            {key.replace(/_/g, ' ')}
                        </label>
                        <input 
                            type="text"
                            onFocus={() => scrollToPlaceholder(key)}
                            className="w-full bg-slate-50 border border-slate-100 rounded-xl px-5 py-4 text-sm focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 outline-none transition-all shadow-inner"
                            placeholder="Введите значение..."
                            value={formData[key] || ''}
                            onChange={(e) => setFormData({...formData, [key]: e.target.value})}
                        />
                        {comment && (
                            <div className="flex items-start gap-2 mt-3 px-1">
                                <Info size={12} className="text-indigo-400 shrink-0 mt-0.5" />
                                <p className="text-[11px] text-slate-400 italic leading-snug">{comment}</p>
                            </div>
                        )}
                    </div>
                ))
            ) : (
                <div className="h-full flex flex-col items-center justify-center text-center px-10">
                    <Wand2 size={48} className="text-slate-200 mb-4 animate-pulse" />
                    <p className="text-xs font-bold text-slate-300 uppercase tracking-widest">Ожидание документа...</p>
                    <p className="text-[10px] text-slate-400 mt-2 italic">Загрузите .docx файл для генерации полей</p>
                </div>
            )}
        </div>

        {/* Футер анкеты (Всегда снизу) */}
        <div className="p-6 bg-slate-50 border-t border-slate-100 shrink-0">
            <button 
                onClick={exportToDocx}
                disabled={!htmlContent || isProcessing}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-4 rounded-2xl font-bold text-xs uppercase tracking-[3px] flex items-center justify-center gap-3 transition-all shadow-xl shadow-indigo-200 active:scale-[0.98] disabled:opacity-30 disabled:grayscale"
            >
                {isProcessing ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
                Export .doc
            </button>
        </div>
      </aside>

      {/* ПРАВАЯ ПАНЕЛЬ (ДОКУМЕНТ): Скроллится независимо */}
      <main className="flex-1 h-full overflow-y-auto bg-[#F1F5F9] relative scroll-smooth p-12">
        <div className="max-w-4xl mx-auto mb-20">
            
            {/* Верхняя навигация рабочей зоны */}
            <div className="flex justify-between items-center mb-10">
                <div className="flex items-center gap-4">
                    <h1 className="text-2xl font-light text-slate-400">Preview <span className="font-bold text-slate-900">Workspace</span></h1>
                </div>
                
                <button 
                    onClick={() => fileInputRef.current.click()}
                    className="group bg-white border border-slate-200 hover:border-indigo-400 px-8 py-3 rounded-full text-xs font-bold text-slate-600 shadow-sm transition-all flex items-center gap-3"
                >
                    <Upload size={14} className="group-hover:-translate-y-0.5 transition-transform" /> 
                    ЗАГРУЗИТЬ .DOCX
                </button>
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".docx" className="hidden" />
            </div>

            {/* ТЕЛО ДОКУМЕНТА (ЛИСТ A4) */}
            <div 
                ref={documentRef}
                className="bg-white shadow-[0_50px_100px_-20px_rgba(0,0,0,0.1)] w-full min-h-[1100px] p-[25mm] border border-slate-200 rounded-sm relative"
                style={{ fontFamily: "'Times New Roman', serif", fontSize: '12pt' }}
            >
                {/* Внутренние стили документа */}
                <style>{`
                    .data-filled { background-color: #EEF2FF; color: #4338CA; font-weight: bold; padding: 0 4px; border-radius: 4px; border-bottom: 2px solid #C7D2FE; transition: all 0.3s; }
                    .data-empty { color: #818CF8; border-bottom: 1px dashed #C7D2FE; font-weight: bold; }
                    .highlight-flash { ring: 4px solid #818CF8; border-radius: 4px; box-shadow: 0 0 20px rgba(129, 140, 248, 0.4); }
                    
                    ol { list-style-type: decimal; padding-left: 2em; margin-bottom: 1em; }
                    ul { list-style-type: disc; padding-left: 2em; margin-bottom: 1em; }
                    li { margin-bottom: 0.5em; display: list-item; }
                    h1, h2 { text-align: center; font-weight: bold; margin-bottom: 1.5em; text-transform: uppercase; letter-spacing: 1px; }
                    p { margin-bottom: 1em; text-align: justify; line-height: 1.5; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 1.5em; }
                    td, th { border: 1px solid #000; padding: 8px; vertical-align: top; }
                `}</style>

                {htmlContent ? (
                    <div 
                        className="animate-in fade-in duration-700"
                        dangerouslySetInnerHTML={{ __html: getProcessedHtml() }} 
                    />
                ) : (
                    <div className="h-[900px] border-4 border-dashed border-slate-100 rounded-[60px] flex flex-col items-center justify-center text-slate-200">
                        <div className="relative mb-6">
                            <div className="absolute -inset-4 bg-indigo-500/5 rounded-full blur-2xl animate-pulse"></div>
                            <FileText size={100} className="relative opacity-20" />
                        </div>
                        <span className="uppercase tracking-[10px] font-black text-slate-300">Lumina Flow</span>
                        <p className="text-[10px] font-bold text-slate-400 mt-4 uppercase tracking-[2px]">Документ не импортирован</p>
                    </div>
                )}
            </div>
        </div>
      </main>
    </div>
  );
}