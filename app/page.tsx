"use client";

import { useState, useRef, useEffect } from "react";

export default function Home() {
  const [isRecording, setIsRecording] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summary, setSummary] = useState<string>(""); 
  const [transcripts, setTranscripts] = useState<string[]>([]);
  const [persona, setPersona] = useState<string>("secretary"); 
  const [isContextLoaded, setIsContextLoaded] = useState(false); 
  const [fileName, setFileName] = useState<string>("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null); 
  
  const chunkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isRecordingRef = useRef<boolean>(false);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcripts]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("https://my-ai-backend-be42.onrender.com/api/upload/context", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (data.status === "success") {
        setIsContextLoaded(true);
      } else {
        alert("Upload error");
      }
    } catch (error) {
      console.error("Upload error:", error);
    }
  };

  const startRecording = async () => {
    try {
      setSummary(""); 
      setTranscripts([]); 
      
      await fetch("https://my-ai-backend-be42.onrender.com/api/meeting/reset", { method: "POST" });
      
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) {
        alert("🚨 อย่าลืมติ๊กเลือก 'แชร์เสียง (Share audio)' ตรงมุมล่างซ้ายก่อนกดแชร์หน้าจอนะครับ!");
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const audioStream = new MediaStream([audioTrack]);
      streamRef.current = audioStream;
      setIsRecording(true);
      isRecordingRef.current = true;

      audioTrack.onended = () => stopRecording();

      let currentRecorder: MediaRecorder | null = null;

      const startNewChunk = () => {
        if (!isRecordingRef.current || !streamRef.current) return;

        const recorder = new MediaRecorder(streamRef.current, { mimeType: "audio/webm" });
        currentRecorder = recorder;
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = async (e) => {
          if (e.data && e.data.size > 1000) {
            const formData = new FormData();
            formData.append("file", e.data, "chunk.webm");
            formData.append("persona", persona); 
            
            try {
              const response = await fetch("https://my-ai-backend-be42.onrender.com/api/audio/chunk", {
                method: "POST",
                body: formData,
              });
              const data = await response.json();
              if (data.status === "success" && data.text) {
                setTranscripts((prev) => [...prev, data.text]);
              }
            } catch (error) {
              console.error("Backend connection error:", error);
            }
          }
        };

        recorder.start();
      };

      startNewChunk();

      chunkIntervalRef.current = setInterval(() => {
        if (currentRecorder && currentRecorder.state === "recording") {
          currentRecorder.stop();
          startNewChunk(); 
        }
      }, 8000);

    } catch (error) {
      console.error("Recording error:", error);
      setIsRecording(false);
      isRecordingRef.current = false;
    }
  };

  const stopRecording = async () => {
    setIsRecording(false);
    isRecordingRef.current = false;
    setIsSummarizing(true); 

    if (chunkIntervalRef.current) {
      clearInterval(chunkIntervalRef.current);
      chunkIntervalRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }

    await new Promise((resolve) => setTimeout(resolve, 1200));

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    setIsContextLoaded(false); 
    setFileName("");
    
    try {
      const response = await fetch(`https://my-ai-backend-be42.onrender.com/api/meeting/summarize?persona=${persona}`, {
        method: "POST",
      });
      const data = await response.json();
      if (data.status === "success") {
        setSummary(data.summary);
      } else {
        setSummary("⚠️ " + data.message);
      }
    } catch (error) {
      setSummary("❌ Failed to generate report.");
    } finally {
      setIsSummarizing(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(summary);
    alert("📋 คัดลอกรายงานเรียบร้อยแล้ว!");
  };

  const downloadSummary = () => {
    const element = document.createElement("a");
    const file = new Blob([summary], { type: "text/plain;charset=utf-8" });
    element.href = URL.createObjectURL(file);
    element.download = `Executive_Summary_${persona}_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const downloadTranscript = () => {
    if (transcripts.length === 0) {
      alert("ไม่มีประวัติการสนทนาให้ดาวน์โหลดครับ");
      return;
    }
    const fullTranscript = transcripts.join("\n\n");
    const element = document.createElement("a");
    const file = new Blob([fullTranscript], { type: "text/plain;charset=utf-8" });
    element.href = URL.createObjectURL(file);
    element.download = `Raw_Transcript_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-start py-12 px-6 bg-[#030712] text-slate-100 font-sans overflow-x-hidden antialiased selection:bg-indigo-500/30">
      
      {/* Background Ambient Glows */}
      <div className="fixed top-[-10%] left-[-10%] w-[500px] h-[500px] bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none mix-blend-screen"></div>
      <div className="fixed bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-purple-600/10 rounded-full blur-[150px] pointer-events-none mix-blend-screen"></div>

      {/* Modern Header */}
      <div className="w-full max-w-5xl flex items-center justify-between mb-16 z-10 backdrop-blur-md bg-white/[0.02] border border-white/[0.05] p-4 rounded-2xl shadow-lg">
        <div className="flex items-center space-x-4">
          <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 shadow-[0_0_20px_rgba(99,102,241,0.4)]">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tighter bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">AURA<span className="font-light">COPILOT</span></h1>
            <p className="text-[10px] font-bold tracking-widest text-indigo-400 uppercase">Enterprise Intelligence</p>
          </div>
        </div>
        
        {isRecording && (
          <div className="flex items-center space-x-2 px-4 py-1.5 bg-red-500/10 border border-red-500/20 rounded-full">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
            </span>
            <span className="text-xs font-bold text-red-400 tracking-wider">LIVE RECORDING</span>
          </div>
        )}
      </div>

      <div className="w-full max-w-5xl z-10 text-center flex flex-col items-center">
        
        {!isRecording && !isSummarizing && !summary && (
          <>
            <h2 className="text-5xl md:text-6xl font-black tracking-tight text-white mb-4 drop-shadow-sm">
              Cognitive <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">Workspace</span>
            </h2>
            <p className="text-slate-400 text-sm md:text-base max-w-2xl mx-auto mb-14 font-light leading-relaxed">
              ยกระดับการประชุมของคุณด้วย AI อัจฉริยะ ถอดความแบบเรียลไทม์ พร้อมวิเคราะห์เชิงลึกและสรุปผลตามบริบทของงานอย่างแม่นยำ
            </p>

            {/* Bento Grid Settings */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-14 w-full max-w-4xl text-left">
              {/* Card 1: Persona */}
              <div className="group relative bg-white/[0.03] backdrop-blur-xl p-8 rounded-3xl border border-white/[0.08] hover:border-indigo-500/50 transition-all duration-300 shadow-2xl hover:shadow-[0_0_30px_rgba(99,102,241,0.15)]">
                <div className="absolute top-0 right-0 p-6 opacity-20 group-hover:opacity-100 transition-opacity">
                  <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                </div>
                <label className="block text-xs font-bold uppercase tracking-widest text-indigo-400 mb-4 flex items-center space-x-2">
                  <span>⚙️</span> <span>Select AI Persona</span>
                </label>
                <select 
                  value={persona}
                  onChange={(e) => setPersona(e.target.value)}
                  className="w-full px-5 py-4 bg-black/40 border border-white/10 rounded-2xl text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none cursor-pointer transition-all hover:bg-black/60"
                >
                  <option value="secretary">📋 โหมดเลขามือโปร (จดบันทึก + AI ช่วยตอบคำถาม/งาน)</option>
                  <option value="podcast">🎙️ โหมด Podcast (ซับไตเติ้ลเรียบง่าย ไหลลื่น ไม่มี AI แทรก)</option>
                  <option value="interview">🎯 โหมดสัมภาษณ์ (วิเคราะห์พร้อมไกด์คำตอบเทพ)</option>
                  <option value="standard">🌐 โหมดมาตรฐาน (กุนซือสารพัดประโยชน์)</option>
                  <option value="student">🎓 โหมดนักเรียน/นักศึกษา (เน้นถอดความบทเรียน)</option>
                  <option value="business">👔 โหมดนักธุรกิจ (วิเคราะห์กลยุทธ์)</option>
                  <option value="sales">💰 โหมดนักขายระดับโลก (ป้อนดีลและสคริปต์ปิดการขาย)</option>
                  <option value="tech">🛠️ โหมด Tech Guru (ช่วยแก้บั๊กและปัญหาเทคนิค)</option>
                  <option value="diplomat">🕊️ โหมดนักการทูต (ลดความขัดแย้ง ประนีประนอม)</option>
                </select>
              </div>

              {/* Card 2: RAG Context */}
              <div className="group relative bg-white/[0.03] backdrop-blur-xl p-8 rounded-3xl border border-white/[0.08] hover:border-purple-500/50 transition-all duration-300 shadow-2xl hover:shadow-[0_0_30px_rgba(168,85,247,0.15)] flex flex-col justify-center">
                <label className="block text-xs font-bold uppercase tracking-widest text-purple-400 mb-4 flex items-center space-x-2">
                  <span>📚</span> <span>Knowledge Base (RAG)</span>
                </label>
                <input type="file" accept=".pdf,.txt" onChange={handleFileUpload} className="hidden" id="file-upload" />
                <label htmlFor="file-upload" className={`w-full flex-1 flex items-center justify-center px-4 py-4 rounded-2xl font-medium text-sm cursor-pointer border-2 border-dashed transition-all duration-300 ${isContextLoaded ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400' : 'bg-black/40 border-white/10 text-slate-400 hover:bg-white/[0.02] hover:border-white/30'}`}>
                  {isContextLoaded ? (
                    <span className="flex items-center space-x-2">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      <span>{fileName.substring(0, 20)}... Uploaded</span>
                    </span>
                  ) : (
                    <span className="flex items-center space-x-2">
                      <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                      <span>Upload Context (.pdf, .txt)</span>
                    </span>
                  )}
                </label>
              </div>
            </div>
          </>
        )}

        {/* Main Action Button */}
        {!summary && (
          <div className="mb-14 relative group">
            {isRecording ? (
              <button onClick={stopRecording} className="relative flex items-center space-x-3 px-12 py-5 bg-gradient-to-r from-red-600 to-rose-600 text-white font-bold rounded-2xl text-sm shadow-[0_0_40px_rgba(225,29,72,0.4)] hover:shadow-[0_0_60px_rgba(225,29,72,0.6)] hover:scale-105 active:scale-95 transition-all duration-300">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" /></svg>
                <span className="tracking-widest uppercase">Terminate & Analyze</span>
              </button>
            ) : isSummarizing ? (
              <div className="flex flex-col items-center space-y-4">
                <div className="relative w-16 h-16 flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full border-t-2 border-indigo-500 animate-spin"></div>
                  <div className="absolute inset-2 rounded-full border-b-2 border-purple-500 animate-spin border-t-transparent"></div>
                </div>
                <div className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400 text-sm font-bold uppercase tracking-widest animate-pulse">
                  Processing Neural Network...
                </div>
              </div>
            ) : (
              <>
                <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-2xl blur opacity-30 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
                <button onClick={startRecording} className="relative flex items-center space-x-3 px-12 py-5 bg-[#030712] border border-white/10 text-white font-bold rounded-2xl text-sm hover:bg-white/[0.02] active:scale-95 transition-all duration-300">
                  <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  <span className="tracking-widest uppercase">Launch AI Copilot</span>
                </button>
              </>
            )}
          </div>
        )}

        {/* Real-time Monitor Box - Chat Bubble Style */}
        {(transcripts.length > 0 || isRecording) && !summary && (
          <div className="w-full max-w-4xl text-left bg-black/40 backdrop-blur-xl p-1 rounded-3xl border border-white/[0.08] shadow-2xl mb-14 h-[500px] flex flex-col overflow-hidden">
            <div className="bg-white/[0.02] px-6 py-4 border-b border-white/[0.05] flex justify-between items-center z-10 rounded-t-3xl">
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]"></div>
                <span className="text-xs text-slate-300 font-bold tracking-widest uppercase">Live Transcript Stream</span>
              </div>
              <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
                {persona} MODE
              </span>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
              {transcripts.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center space-y-4 opacity-50">
                  <svg className="w-12 h-12 text-slate-500 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                  <div className="text-slate-400 text-sm tracking-wide font-light">Awaiting audio signals...</div>
                </div>
              ) : (
                transcripts.map((text, index) => (
                  <div key={index} className="flex animate-fade-in-up">
                    <div className="max-w-[85%] bg-white/[0.04] border border-white/[0.05] text-slate-200 text-sm leading-relaxed p-5 rounded-2xl rounded-tl-sm shadow-md">
                      {text}
                    </div>
                  </div>
                ))
              )}
              {isRecording && transcripts.length > 0 && (
                <div className="flex space-x-1 items-center p-4">
                  <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
              )}
              <div ref={transcriptEndRef} />
            </div>
          </div>
        )}

        {/* Final Document Presentation */}
        {summary && (
          <div className="w-full max-w-4xl text-left bg-white/[0.03] backdrop-blur-2xl p-2 md:p-8 rounded-[2rem] border border-white/[0.08] shadow-[0_0_50px_rgba(0,0,0,0.5)] mb-20">
            <div className="flex items-center justify-between mb-8 px-4 md:px-0">
              <div>
                <h2 className="text-2xl font-black text-white tracking-tight">Executive Report</h2>
                <p className="text-indigo-400 text-xs font-bold tracking-widest uppercase mt-1">Generated via {persona} persona</p>
              </div>
              <div className="h-12 w-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              </div>
            </div>
            
            <div className="text-slate-300 whitespace-pre-wrap leading-relaxed text-sm bg-black/50 p-6 md:p-8 rounded-3xl mb-8 border border-white/[0.05] shadow-inner font-light">
              {summary}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 px-4 md:px-0">
              <button onClick={copyToClipboard} className="flex items-center justify-center space-x-2 px-6 py-4 bg-white/[0.05] text-slate-300 font-bold text-xs rounded-2xl border border-white/10 hover:bg-white/10 hover:text-white transition-all duration-300">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                <span>COPY SUMMARY</span>
              </button>
              
              <button onClick={downloadSummary} className="flex items-center justify-center space-x-2 px-6 py-4 bg-indigo-600/20 text-indigo-300 font-bold text-xs rounded-2xl border border-indigo-500/30 hover:bg-indigo-600/40 hover:text-white transition-all duration-300">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                <span>SAVE AS .TXT</span>
              </button>
              
              <button onClick={downloadTranscript} className="flex items-center justify-center space-x-2 px-6 py-4 bg-emerald-500/20 text-emerald-400 font-bold text-xs rounded-2xl border border-emerald-500/30 hover:bg-emerald-500/40 hover:text-white shadow-[0_0_15px_rgba(16,185,129,0.15)] transition-all duration-300">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <span>RAW TRANSCRIPT</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Global CSS for some subtle animations */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes fade-in-up {
          0% { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up {
          animation: fade-in-up 0.4s ease-out forwards;
        }
      `}} />
    </main>
  );
}