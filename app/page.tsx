"use client";

import { useState, useRef, useEffect } from "react";

export default function Home() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false); 
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
  
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const eqBarsRef = useRef<(HTMLDivElement | null)[]>([]);

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

  const togglePause = () => {
    if (!mediaRecorderRef.current) return;

    if (mediaRecorderRef.current.state === "paused") {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
    } else if (mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      // บังคับ EQ ให้ลดต่ำสุดเวลาหยุดพัก
      eqBarsRef.current.forEach(bar => {
        if (bar) bar.style.height = '15%'; 
      });
    }
  };

  const startRecording = async () => {
    try {
      setSummary(""); 
      setTranscripts([]); 
      setIsPaused(false); 
      
      await fetch("https://my-ai-backend-be42.onrender.com/api/meeting/reset", { method: "POST" });
      
      // 🛠️ FIX 1: สร้าง AudioContext ก่อนมี await เพื่อแก้ปัญหาเบราว์เซอร์บล็อก EQ
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextClass();
      
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

      // ปลุกให้เสียงทำงานหลังจากได้ Stream มาแล้ว
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      const audioStream = new MediaStream([audioTrack]);
      streamRef.current = audioStream;
      setIsRecording(true);
      isRecordingRef.current = true;

      // --- 🛠️ FIX 2: ปรับแต่ง EQ Visualizer Setup ให้จับคลื่นเสียงได้ไวขึ้น ---
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 128; 
      const source = audioContext.createMediaStreamSource(audioStream);
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateEQ = () => {
        if (!isRecordingRef.current) return;

        if (analyserRef.current && mediaRecorderRef.current && mediaRecorderRef.current.state !== 'paused') {
          analyserRef.current.getByteFrequencyData(dataArray);
          for (let i = 0; i < 5; i++) {
            const bar = eqBarsRef.current[i];
            if (bar) {
              // ใช้คลื่นความถี่ช่วงล่าง (เสียงพูดคน) ให้แท่งกระดิกชัดขึ้น
              const dataIndex = Math.floor((i / 5) * (dataArray.length / 2)); 
              const value = dataArray[dataIndex];
              const height = Math.max(15, (value / 255) * 100);
              bar.style.height = `${height}%`;
            }
          }
        }
        animationFrameRef.current = requestAnimationFrame(updateEQ);
      };

      updateEQ();
      // -------------------------------------

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
      setIsPaused(false);
      isRecordingRef.current = false;
    }
  };

  const stopRecording = async () => {
    setIsRecording(false);
    setIsPaused(false);
    isRecordingRef.current = false;
    setIsSummarizing(true); 

    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (analyserRef.current) {
      analyserRef.current.context.close();
      analyserRef.current = null;
    }

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

  const resetSession = () => {
    setSummary("");
    setTranscripts([]);
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
    <main className="relative flex min-h-screen flex-col items-center justify-start py-8 px-4 md:px-8 bg-[#020617] text-slate-100 font-sans overflow-x-hidden antialiased selection:bg-indigo-500/30">
      
      <div className="fixed top-[-20%] left-[-10%] w-[70vw] h-[70vw] max-w-[800px] max-h-[800px] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none mix-blend-screen"></div>
      <div className="fixed bottom-[-20%] right-[-10%] w-[60vw] h-[60vw] max-w-[600px] max-h-[600px] bg-purple-600/10 rounded-full blur-[150px] pointer-events-none mix-blend-screen"></div>
      <div className="fixed top-[40%] left-[50%] translate-x-[-50%] w-[40vw] h-[40vw] max-w-[500px] max-h-[500px] bg-blue-600/5 rounded-full blur-[100px] pointer-events-none mix-blend-screen"></div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes fade-in-up {
          0% { opacity: 0; transform: translateY(15px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up { animation: fade-in-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.02); border-radius: 10px; }
        ::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(99, 102, 241, 0.5); }
      `}} />

      <header className="w-full max-w-6xl flex items-center justify-between mb-10 z-10 bg-white/[0.02] backdrop-blur-xl border border-white/[0.05] py-4 px-6 rounded-3xl shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
        <div className="flex items-center space-x-4">
          <div className={`relative flex h-12 w-12 items-center justify-center rounded-2xl shadow-[0_0_25px_rgba(99,102,241,0.4)] transition-colors duration-500 ${isPaused ? 'bg-gradient-to-br from-yellow-500 via-orange-500 to-red-500' : 'bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500'}`}>
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            {isRecording && !isPaused && <span className="absolute -top-1 -right-1 flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-red-500 border-2 border-[#020617]"></span></span>}
            {isPaused && <span className="absolute -top-1 -right-1 flex h-3 w-3"><span className="relative inline-flex rounded-full h-3 w-3 bg-yellow-500 border-2 border-[#020617]"></span></span>}
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tighter bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">AURA<span className="font-light">COPILOT</span></h1>
            <p className="text-[10px] font-bold tracking-widest text-indigo-400/80 uppercase">Cognitive Intelligence</p>
          </div>
        </div>
        
        {isRecording && (
          // 🛠️ FIX 3: ลบ hidden ออก เพื่อให้เห็นแผง EQ เสมอแม้จอย่อส่วน
          <div className={`flex items-center space-x-3 px-5 py-2 border rounded-full transition-all duration-300 ${isPaused ? 'bg-yellow-500/10 border-yellow-500/20 shadow-[0_0_15px_rgba(234,179,8,0.2)]' : 'bg-red-500/10 border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.2)]'}`}>
            <div className="flex items-end space-x-1 h-4 w-10">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  ref={(el) => {
                    if (el) eqBarsRef.current[i] = el;
                  }}
                  className={`w-1.5 rounded-full transition-all duration-[50ms] ${isPaused ? 'bg-yellow-400' : 'bg-red-400'}`}
                  style={{ height: '15%' }}
                ></div>
              ))}
            </div>
            <span className={`text-xs font-bold tracking-wider ${isPaused ? 'text-yellow-400' : 'text-red-400'}`}>
              {isPaused ? "PAUSED" : "REC"}
            </span>
          </div>
        )}
      </header>

      <div className="w-full max-w-6xl z-10 flex flex-col items-center">
        
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
              <div className="group relative bg-white/[0.02] backdrop-blur-2xl p-8 rounded-[2rem] border border-white/[0.05] hover:border-indigo-500/30 hover:bg-white/[0.04] transition-all duration-500 shadow-2xl">
                <label className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-5 flex items-center space-x-3">
                  <span className="p-2 bg-indigo-500/10 rounded-lg">⚙️</span>
                  <span>AI Persona Setup</span>
                </label>
                <select 
                  value={persona}
                  onChange={(e) => setPersona(e.target.value)}
                  className="w-full pl-5 pr-10 py-4 bg-[#09090b]/80 border border-white/10 rounded-2xl text-slate-200 text-sm focus:outline-none focus:border-indigo-500/50 appearance-none cursor-pointer"
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
              </div>

              <div className="group relative bg-white/[0.02] backdrop-blur-2xl p-8 rounded-[2rem] border border-white/[0.05] hover:border-purple-500/30 hover:bg-white/[0.04] transition-all duration-500 shadow-2xl flex flex-col">
                <label className="text-xs font-bold uppercase tracking-widest text-purple-400 mb-5 flex items-center space-x-3">
                  <span className="p-2 bg-purple-500/10 rounded-lg">📚</span>
                  <span>Knowledge Base (RAG)</span>
                </label>
                <input type="file" accept=".pdf,.txt" onChange={handleFileUpload} className="hidden" id="file-upload" />
                <label htmlFor="file-upload" className={`w-full flex-1 flex flex-col items-center justify-center px-4 py-4 rounded-2xl font-medium text-sm cursor-pointer border-2 border-dashed transition-all duration-300 ${isContextLoaded ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400' : 'bg-[#09090b]/80 border-white/10 text-slate-400'}`}>
                  {isContextLoaded ? (
                    <span className="text-emerald-400 font-bold tracking-wide text-center">✓ {fileName} Ready</span>
                  ) : (
                    <span>Upload Documents (.pdf, .txt)</span>
                  )}
                </label>
              </div>
            </div>
          </div>
        )}

        {!summary && (
          <div className="mb-12 relative w-full flex justify-center z-20">
            {isRecording ? (
              // 🛠️ FIX 4: ใส่ flex-wrap เพื่อไม่ให้ปุ่มตกขอบในจอเล็ก
              <div className="flex flex-wrap justify-center gap-4">
                <button onClick={togglePause} className={`group relative flex items-center space-x-3 px-8 py-6 border backdrop-blur-md text-white font-bold rounded-full text-sm shadow-[0_0_40px_rgba(249,115,22,0.3)] transition-all duration-300 ${isPaused ? 'bg-yellow-500/10 border-yellow-500/50' : 'bg-orange-500/10 border-orange-500/50'}`}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    {isPaused ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /> : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6" />}
                  </svg>
                  <span className="tracking-widest uppercase">{isPaused ? "Resume" : "Pause"}</span>
                </button>

                <button onClick={stopRecording} className="group relative flex items-center space-x-3 px-10 py-6 bg-rose-600/10 border border-rose-500/50 backdrop-blur-md text-white font-bold rounded-full text-sm shadow-[0_0_40px_rgba(225,29,72,0.3)] hover:bg-rose-600/20 active:scale-95 transition-all duration-300">
                  <div className="w-3 h-3 bg-rose-500 rounded-sm animate-pulse"></div>
                  <span className="tracking-widest uppercase text-rose-100">Terminate & Analyze</span>
                </button>
              </div>
            ) : isSummarizing ? (
              <div className="text-indigo-400 font-bold uppercase tracking-widest animate-pulse">Processing...</div>
            ) : (
              <button onClick={startRecording} className="relative flex items-center space-x-3 px-12 py-5 bg-[#020617] border border-white/10 text-white font-bold rounded-full text-sm hover:bg-white/[0.05] active:scale-95 transition-all duration-300">
                <span className="tracking-widest uppercase">Launch AI Copilot</span>
              </button>
            )}
          </div>
        )}

        {(transcripts.length > 0 || isRecording) && !summary && (
          <div className="w-full max-w-5xl text-left bg-black/30 backdrop-blur-2xl rounded-[2.5rem] border border-white/[0.05] shadow-[0_0_50px_rgba(0,0,0,0.5)] mb-14 h-[500px] flex flex-col overflow-hidden animate-fade-in-up">
            <div className="bg-white/[0.02] px-8 py-5 border-b border-white/[0.05] flex justify-between items-center z-10 shadow-sm">
              <div className="flex items-center space-x-4">
                <div className="relative flex h-4 w-4 items-center justify-center">
                  <span className={`absolute inline-flex h-full w-full rounded-full opacity-50 ${isPaused ? 'bg-yellow-400' : 'bg-emerald-400 animate-ping'}`}></span>
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${isPaused ? 'bg-yellow-500' : 'bg-emerald-500'}`}></span>
                </div>
                <span className="text-xs text-slate-300 font-bold tracking-[0.2em] uppercase">
                  {isPaused ? "Signal Paused" : "Live Cognitive Stream"}
                </span>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 space-y-8 scroll-smooth scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent relative">
              {transcripts.length === 0 ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center space-y-5 opacity-40">
                  <div className="text-slate-400 text-sm tracking-widest uppercase font-bold">Awaiting Input Signal</div>
                </div>
              ) : (
                transcripts.map((text, index) => (
                  <div key={index} className="flex animate-fade-in-up">
                    <div className="max-w-[85%] bg-white/[0.03] backdrop-blur-sm border border-white/[0.05] text-slate-200 text-sm leading-relaxed p-6 rounded-3xl shadow-lg">
                      {text}
                    </div>
                  </div>
                ))
              )}
              <div ref={transcriptEndRef} />
            </div>
          </div>
        )}

        {summary && (
          <div className="w-full max-w-5xl text-left bg-[#050505] p-1 md:p-2 rounded-[2rem] border border-white/[0.05] mb-20">
            <div className="bg-white/[0.02] backdrop-blur-3xl rounded-[1.8rem] p-6 md:p-10 border border-white/[0.02]">
              <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 pb-8 border-b border-white/[0.05] gap-6">
                <h2 className="text-3xl font-black text-white tracking-tight mb-2">Executive Report</h2>
                <button onClick={resetSession} className="px-5 py-3 bg-white/[0.05] hover:bg-indigo-500/20 text-slate-300 font-bold text-xs rounded-xl border border-white/10">START NEW SESSION</button>
              </div>
              <div className="text-slate-200 whitespace-pre-wrap leading-relaxed text-[15px] bg-[#020202] p-8 md:p-10 rounded-2xl mb-10 border border-white/[0.03] font-light">{summary}</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <button onClick={copyToClipboard} className="px-6 py-4 bg-white/[0.03] text-slate-300 font-bold text-xs tracking-widest rounded-2xl border border-white/[0.05]">COPY SUMMARY</button>
                <button onClick={downloadSummary} className="px-6 py-4 bg-indigo-500/10 text-indigo-300 font-bold text-xs tracking-widest rounded-2xl border border-indigo-500/20">SAVE AS .TXT</button>
                <button onClick={downloadTranscript} className="px-6 py-4 bg-emerald-500/10 text-emerald-400 font-bold text-xs tracking-widest rounded-2xl border border-emerald-500/20">RAW TRANSCRIPT</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}