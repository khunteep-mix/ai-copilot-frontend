"use client";

import { useState, useRef, useEffect } from "react";

export default function Home() {
  // State Management
  const [isRecording, setIsRecording] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summary, setSummary] = useState<string>(""); 
  const [transcripts, setTranscripts] = useState<string[]>([]);
  const [persona, setPersona] = useState<string>("secretary"); 
  const [isContextLoaded, setIsContextLoaded] = useState(false); 
  const [fileName, setFileName] = useState<string>("");

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null); 
  const chunkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isRecordingRef = useRef<boolean>(false);

  // Auto-scroll to bottom of transcripts
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcripts]);

  // Handle RAG File Upload
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

  // Start Recording Session
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

  // Stop Recording and Generate Summary
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

  // NEW: Reset Session to start over
  const resetSession = () => {
    setSummary("");
    setTranscripts([]);
    // We intentionally keep `persona` and `isContextLoaded` so users don't have to re-upload/select for the next meeting.
  };

  // Utility Functions
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
    <main className="relative flex min-h-screen flex-col items-center justify-start py-8 px-4 md:px-8 bg-[#020617] text-slate-100 font-sans overflow-x-hidden antialiased selection:bg-indigo-500/30">
      
      {/* Deep Space Background Glows */}
      <div className="fixed top-[-20%] left-[-10%] w-[70vw] h-[70vw] max-w-[800px] max-h-[800px] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none mix-blend-screen"></div>
      <div className="fixed bottom-[-20%] right-[-10%] w-[60vw] h-[60vw] max-w-[600px] max-h-[600px] bg-purple-600/10 rounded-full blur-[150px] pointer-events-none mix-blend-screen"></div>
      <div className="fixed top-[40%] left-[50%] translate-x-[-50%] w-[40vw] h-[40vw] max-w-[500px] max-h-[500px] bg-blue-600/5 rounded-full blur-[100px] pointer-events-none mix-blend-screen"></div>

      {/* Global CSS for Animations & Scrollbars */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes fade-in-up {
          0% { opacity: 0; transform: translateY(15px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up { animation: fade-in-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        
        @keyframes equalizer {
          0%, 100% { height: 8px; }
          50% { height: 24px; }
        }
        .eq-bar { animation: equalizer 1s ease-in-out infinite; }
        .eq-bar:nth-child(1) { animation-delay: 0.1s; }
        .eq-bar:nth-child(2) { animation-delay: 0.3s; }
        .eq-bar:nth-child(3) { animation-delay: 0.0s; }
        .eq-bar:nth-child(4) { animation-delay: 0.4s; }
        .eq-bar:nth-child(5) { animation-delay: 0.2s; }

        /* Custom Scrollbar for Glassmorphism */
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.02); border-radius: 10px; }
        ::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(99, 102, 241, 0.5); }
      `}} />

      {/* Futuristic Header */}
      <header className="w-full max-w-6xl flex items-center justify-between mb-10 z-10 bg-white/[0.02] backdrop-blur-xl border border-white/[0.05] py-4 px-6 rounded-3xl shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
        <div className="flex items-center space-x-4">
          <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 shadow-[0_0_25px_rgba(99,102,241,0.4)]">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            {isRecording && <span className="absolute -top-1 -right-1 flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-red-500 border-2 border-[#020617]"></span></span>}
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tighter bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">AURA<span className="font-light">COPILOT</span></h1>
            <p className="text-[10px] font-bold tracking-widest text-indigo-400/80 uppercase">Cognitive Intelligence</p>
          </div>
        </div>
        
        {isRecording && (
          <div className="hidden md:flex items-center space-x-3 px-5 py-2 bg-red-500/10 border border-red-500/20 rounded-full shadow-[0_0_15px_rgba(239,68,68,0.2)]">
            <div className="flex items-end space-x-1 h-4">
              <div className="w-1 bg-red-400 rounded-full eq-bar"></div>
              <div className="w-1 bg-red-400 rounded-full eq-bar"></div>
              <div className="w-1 bg-red-400 rounded-full eq-bar"></div>
              <div className="w-1 bg-red-400 rounded-full eq-bar"></div>
              <div className="w-1 bg-red-400 rounded-full eq-bar"></div>
            </div>
            <span className="text-xs font-bold text-red-400 tracking-wider">RECORDING</span>
          </div>
        )}
      </header>

      <div className="w-full max-w-6xl z-10 flex flex-col items-center">
        
        {/* Dashboard Configuration (Only show when NOT recording and NO summary) */}
        {!isRecording && !isSummarizing && !summary && (
          <div className="w-full flex flex-col items-center animate-fade-in-up">
            <div className="text-center mb-12">
              <h2 className="text-5xl md:text-7xl font-black tracking-tighter text-white mb-6 drop-shadow-lg">
                Supercharge <br className="md:hidden" />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">Your Meetings</span>
              </h2>
              <p className="text-slate-400 text-sm md:text-base max-w-2xl mx-auto font-light leading-relaxed">
                ระบบถอดความและวิเคราะห์การประชุมด้วย AI ขั้นสูงแบบเรียลไทม์ พร้อมสรุปผลอัจฉริยะตามรูปแบบการทำงานของคุณ
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl text-left mb-12">
              {/* Persona Selection Card */}
              <div className="group relative bg-white/[0.02] backdrop-blur-2xl p-8 rounded-[2rem] border border-white/[0.05] hover:border-indigo-500/30 hover:bg-white/[0.04] transition-all duration-500 shadow-2xl">
                <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-30 group-hover:scale-110 transition-all duration-500">
                  <svg className="w-12 h-12 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                </div>
                <label className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-5 flex items-center space-x-3">
                  <span className="p-2 bg-indigo-500/10 rounded-lg">⚙️</span>
                  <span>AI Persona Setup</span>
                </label>
                <div className="relative">
                  <select 
                    value={persona}
                    onChange={(e) => setPersona(e.target.value)}
                    className="w-full pl-5 pr-10 py-4 bg-[#09090b]/80 border border-white/10 rounded-2xl text-slate-200 text-sm focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 appearance-none cursor-pointer transition-all hover:border-white/20"
                  >
                    <option value="secretary">📋 เลขามือโปร (จดบันทึก + AI ช่วยตอบคำถาม)</option>
                    <option value="podcast">🎙️ Podcast (ซับไตเติ้ลเรียบง่าย ไหลลื่น)</option>
                    <option value="interview">🎯 สัมภาษณ์ (วิเคราะห์พร้อมไกด์คำตอบเทพ)</option>
                    <option value="standard">🌐 มาตรฐาน (กุนซือสารพัดประโยชน์)</option>
                    <option value="student">🎓 นักศึกษา (เน้นถอดความบทเรียน)</option>
                    <option value="business">👔 นักธุรกิจ (วิเคราะห์กลยุทธ์)</option>
                    <option value="sales">💰 นักขายระดับโลก (สคริปต์ปิดการขาย)</option>
                    <option value="tech">🛠️ Tech Guru (ช่วยแก้บั๊กและเทคนิค)</option>
                    <option value="diplomat">🕊️ นักการทูต (ลดความขัดแย้ง)</option>
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                    <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </div>
                </div>
              </div>

              {/* RAG Context Card */}
              <div className="group relative bg-white/[0.02] backdrop-blur-2xl p-8 rounded-[2rem] border border-white/[0.05] hover:border-purple-500/30 hover:bg-white/[0.04] transition-all duration-500 shadow-2xl flex flex-col">
                <label className="text-xs font-bold uppercase tracking-widest text-purple-400 mb-5 flex items-center space-x-3">
                  <span className="p-2 bg-purple-500/10 rounded-lg">📚</span>
                  <span>Knowledge Base (RAG)</span>
                </label>
                <input type="file" accept=".pdf,.txt" onChange={handleFileUpload} className="hidden" id="file-upload" />
                <label htmlFor="file-upload" className={`w-full flex-1 flex flex-col items-center justify-center px-4 py-4 rounded-2xl font-medium text-sm cursor-pointer border-2 border-dashed transition-all duration-300 ${isContextLoaded ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.1)]' : 'bg-[#09090b]/80 border-white/10 text-slate-400 hover:border-purple-500/50 hover:text-purple-300'}`}>
                  {isContextLoaded ? (
                    <>
                      <svg className="w-8 h-8 mb-2 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      <span className="text-emerald-400 font-bold tracking-wide text-center">{fileName}</span>
                      <span className="text-[10px] text-emerald-500/60 mt-1 uppercase tracking-widest">Context Ready</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-8 h-8 mb-2 text-slate-500 group-hover:text-purple-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                      <span className="tracking-wide">Upload Documents (.pdf, .txt)</span>
                      <span className="text-[10px] text-slate-500 mt-1">Enhance AI accuracy with your data</span>
                    </>
                  )}
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Dynamic Action Area */}
        {!summary && (
          <div className="mb-12 relative w-full flex justify-center z-20">
            {isRecording ? (
              <button onClick={stopRecording} className="group relative flex items-center space-x-4 px-10 py-6 bg-rose-600/10 border border-rose-500/50 backdrop-blur-md text-white font-bold rounded-full text-sm shadow-[0_0_40px_rgba(225,29,72,0.3)] hover:shadow-[0_0_60px_rgba(225,29,72,0.5)] hover:bg-rose-600/20 active:scale-95 transition-all duration-300 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"></div>
                <div className="w-3 h-3 bg-rose-500 rounded-sm animate-pulse"></div>
                <span className="tracking-widest uppercase text-rose-100">Terminate & Analyze</span>
              </button>
            ) : isSummarizing ? (
              <div className="flex flex-col items-center space-y-6 bg-black/40 backdrop-blur-xl border border-white/10 p-8 rounded-3xl w-full max-w-md">
                <div className="relative w-20 h-20 flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full border-t-2 border-indigo-500 animate-[spin_1.5s_linear_infinite]"></div>
                  <div className="absolute inset-2 rounded-full border-b-2 border-purple-500 animate-[spin_2s_linear_infinite_reverse]"></div>
                  <div className="absolute inset-4 rounded-full border-r-2 border-pink-500 animate-[spin_1s_linear_infinite]"></div>
                  <svg className="w-6 h-6 text-white absolute animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                </div>
                <div className="text-center">
                  <div className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400 text-sm font-bold uppercase tracking-widest mb-1">
                    Neural Processing
                  </div>
                  <div className="text-slate-500 text-xs font-light tracking-wide">Synthesizing meeting insights...</div>
                </div>
              </div>
            ) : (
              <div className="relative group animate-fade-in-up">
                <div className="absolute -inset-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-full blur-md opacity-40 group-hover:opacity-100 transition duration-700"></div>
                <button onClick={startRecording} className="relative flex items-center space-x-3 px-12 py-5 bg-[#020617] border border-white/10 text-white font-bold rounded-full text-sm hover:bg-white/[0.05] active:scale-95 transition-all duration-300">
                  <svg className="w-5 h-5 text-indigo-400 group-hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <span className="tracking-widest uppercase">Launch AI Copilot</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Real-time Monitor Box - Holographic Chat Bubbles */}
        {(transcripts.length > 0 || isRecording) && !summary && (
          <div className="w-full max-w-5xl text-left bg-black/30 backdrop-blur-2xl rounded-[2.5rem] border border-white/[0.05] shadow-[0_0_50px_rgba(0,0,0,0.5)] mb-14 h-[500px] flex flex-col overflow-hidden animate-fade-in-up">
            <div className="bg-white/[0.02] px-8 py-5 border-b border-white/[0.05] flex justify-between items-center z-10 shadow-sm">
              <div className="flex items-center space-x-4">
                <div className="relative flex h-4 w-4 items-center justify-center">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,1)]"></span>
                </div>
                <span className="text-xs text-slate-300 font-bold tracking-[0.2em] uppercase">Live Cognitive Stream</span>
              </div>
              <div className="flex items-center space-x-3">
                <span className="bg-white/[0.05] border border-white/[0.05] px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {transcripts.length} Chunks
                </span>
                <span className="bg-gradient-to-r from-indigo-500/20 to-purple-500/20 text-indigo-300 border border-indigo-500/30 px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-[0_0_10px_rgba(99,102,241,0.2)]">
                  {persona} MODE
                </span>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 space-y-8 scroll-smooth scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent relative">
              {transcripts.length === 0 ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center space-y-5 opacity-40">
                  <div className="relative w-16 h-16">
                    <div className="absolute inset-0 rounded-full border border-slate-500 animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite]"></div>
                    <div className="absolute inset-4 rounded-full border border-slate-400 animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite_0.5s]"></div>
                  </div>
                  <div className="text-slate-400 text-sm tracking-widest uppercase font-bold">Awaiting Input Signal</div>
                </div>
              ) : (
                transcripts.map((text, index) => (
                  <div key={index} className="flex animate-fade-in-up">
                    <div className="max-w-[85%] bg-white/[0.03] backdrop-blur-sm border border-white/[0.05] text-slate-200 text-sm leading-relaxed p-6 rounded-3xl rounded-tl-sm shadow-lg hover:bg-white/[0.05] transition-colors">
                      {text}
                    </div>
                  </div>
                ))
              )}
              {isRecording && transcripts.length > 0 && (
                <div className="flex space-x-2 items-center p-4 opacity-50">
                  <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-1.5 h-1.5 bg-pink-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
              )}
              <div ref={transcriptEndRef} />
            </div>
          </div>
        )}

        {/* Final Document Presentation - Enterprise Report */}
        {summary && (
          <div className="w-full max-w-5xl text-left bg-[#050505] p-1 md:p-2 rounded-[2rem] border border-white/[0.05] shadow-[0_0_60px_rgba(0,0,0,0.8)] mb-20 animate-fade-in-up">
            <div className="bg-white/[0.02] backdrop-blur-3xl rounded-[1.8rem] p-6 md:p-10 border border-white/[0.02]">
              
              {/* Report Header */}
              <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 pb-8 border-b border-white/[0.05] gap-6">
                <div>
                  <h2 className="text-3xl font-black text-white tracking-tight mb-2">Executive Report</h2>
                  <div className="flex items-center space-x-3">
                    <span className="flex items-center space-x-1.5 text-emerald-400 text-xs font-bold tracking-widest uppercase bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                      <span>Analysis Complete</span>
                    </span>
                    <span className="text-slate-500 text-xs font-semibold tracking-wider">
                      {new Date().toLocaleDateString('en-GB')}
                    </span>
                  </div>
                </div>
                
                {/* NEW: Reset Session Button (Top Right) */}
                <button onClick={resetSession} className="flex items-center justify-center space-x-2 px-5 py-3 bg-white/[0.05] hover:bg-indigo-500/20 text-slate-300 hover:text-indigo-300 font-bold text-xs rounded-xl border border-white/10 hover:border-indigo-500/30 transition-all duration-300 self-start md:self-auto">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  <span>START NEW SESSION</span>
                </button>
              </div>
              
              {/* Report Content Area */}
              <div className="text-slate-200 whitespace-pre-wrap leading-relaxed text-[15px] bg-[#020202] p-8 md:p-10 rounded-2xl mb-10 border border-white/[0.03] shadow-inner font-light">
                {summary}
              </div>
              
              {/* Action Buttons */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <button onClick={copyToClipboard} className="group flex items-center justify-center space-x-3 px-6 py-4 bg-white/[0.03] text-slate-300 font-bold text-xs tracking-widest rounded-2xl border border-white/[0.05] hover:bg-white/[0.08] hover:text-white transition-all duration-300">
                  <svg className="w-5 h-5 text-slate-400 group-hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                  <span>COPY SUMMARY</span>
                </button>
                
                <button onClick={downloadSummary} className="group flex items-center justify-center space-x-3 px-6 py-4 bg-indigo-500/10 text-indigo-300 font-bold text-xs tracking-widest rounded-2xl border border-indigo-500/20 hover:bg-indigo-500/20 hover:text-indigo-200 transition-all duration-300 shadow-[0_0_15px_rgba(99,102,241,0.05)]">
                  <svg className="w-5 h-5 text-indigo-400 group-hover:text-indigo-300 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  <span>SAVE AS .TXT</span>
                </button>
                
                <button onClick={downloadTranscript} className="group flex items-center justify-center space-x-3 px-6 py-4 bg-emerald-500/10 text-emerald-400 font-bold text-xs tracking-widest rounded-2xl border border-emerald-500/20 hover:bg-emerald-500/20 hover:text-emerald-300 transition-all duration-300 shadow-[0_0_15px_rgba(16,185,129,0.05)]">
                  <svg className="w-5 h-5 text-emerald-500 group-hover:text-emerald-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <span>RAW TRANSCRIPT</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}