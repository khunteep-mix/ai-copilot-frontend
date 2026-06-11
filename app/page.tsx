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
        alert(`โหลดความรู้จากไฟล์ ${file.name} เรียบร้อยแล้ว!`);
      }
    } catch (error) {
      console.error("Error uploading file:", error);
      alert("เกิดข้อผิดพลาดในการอัปโหลดไฟล์");
    }
  };

  const startRecording = async () => {
    try {
      // เรียกใช้ API เพื่อล้างข้อมูลการประชุมเก่าก่อนเริ่มใหม่
      await fetch("https://my-ai-backend-be42.onrender.com/api/meeting/reset", { method: "POST" });
      
      setTranscripts([]);
      setSummary("");
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0 && isRecordingRef.current) {
          sendAudioChunk(event.data);
        }
      };

      mediaRecorder.start();
      isRecordingRef.current = true;
      setIsRecording(true);

      chunkIntervalRef.current = setInterval(() => {
        if (mediaRecorder.state === "recording") {
          mediaRecorder.requestData();
        }
      }, 8000);

    } catch (error) {
      console.error("Error accessing microphone:", error);
      alert("กรุณาอนุญาตการใช้งานไมโครโฟน");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.requestData();
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (chunkIntervalRef.current) {
      clearInterval(chunkIntervalRef.current);
    }
    
    isRecordingRef.current = false;
    setIsRecording(false);
    generateSummary();
  };

  const sendAudioChunk = async (audioBlob: Blob) => {
    const formData = new FormData();
    formData.append("file", audioBlob, "chunk.webm");
    formData.append("persona", persona);

    try {
      const response = await fetch("https://my-ai-backend-be42.onrender.com/api/meeting/chunk", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      
      if (data.transcript) {
        setTranscripts((prev) => [...prev, data.transcript]);
        if (data.ai_response) {
          setTranscripts((prev) => [...prev, `💡 [AI]: ${data.ai_response}`]);
        }
      }
    } catch (error) {
      console.error("Error sending chunk:", error);
    }
  };

  const generateSummary = async () => {
    setIsSummarizing(true);
    try {
      const response = await fetch("https://my-ai-backend-be42.onrender.com/api/meeting/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona: persona })
      });
      const data = await response.json();
      setSummary(data.summary);
    } catch (error) {
      console.error("Error generating summary:", error);
      setSummary("เกิดข้อผิดพลาดในการสรุปผล กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsSummarizing(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(summary);
    alert("คัดลอกลง Clipboard เรียบร้อยแล้ว!");
  };

  const downloadSummary = () => {
    const blob = new Blob([summary], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Meeting_Summary_${new Date().toISOString().slice(0,10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ฟังก์ชันใหม่: สำหรับโหลดประวัติแชท Real-time
  const downloadTranscript = () => {
    if (transcripts.length === 0) {
      alert("ไม่มีประวัติการสนทนาให้ดาวน์โหลดครับ");
      return;
    }
    const fullTranscript = transcripts.join("\n\n");
    const blob = new Blob([fullTranscript], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Meeting_Transcript_${new Date().toISOString().slice(0,10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 font-sans p-6 selection:bg-indigo-500/30">
      <div className="max-w-5xl mx-auto space-y-8">
        
        <div className="text-center space-y-4 pt-12 pb-8">
          <div className="inline-flex items-center justify-center px-4 py-1.5 rounded-full bg-indigo-950/50 border border-indigo-500/20 text-indigo-400 text-sm font-semibold tracking-widest mb-4">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse mr-2"></span>
            AURA COPILOT
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight">
            AI Real-time <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">Dialogue</span>
          </h1>
          <p className="text-slate-400 max-w-xl mx-auto text-sm md:text-base">
            ผู้ช่วยฟังและสรุปการประชุมอัจฉริยะแบบเรียลไทม์ พร้อมโหมดให้คำปรึกษาเฉพาะทาง
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
          <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-2xl flex flex-col items-center justify-center space-y-3">
            <label className="text-xs font-bold text-slate-500 tracking-wider">🎭 SELECT PERSONA</label>
            <select 
              value={persona} 
              onChange={(e) => setPersona(e.target.value)}
              disabled={isRecording}
              className="bg-slate-950 border border-slate-700 text-white text-sm rounded-xl focus:ring-indigo-500 focus:border-indigo-500 block w-full p-3 transition-colors disabled:opacity-50 outline-none"
            >
              <option value="secretary">👩‍💼 Secretary (เลขาฯ สรุปงาน)</option>
              <option value="podcast">🎧 Podcast (จดอย่างเดียว ไม่พูดแทรก)</option>
              <option value="tech">💻 Tech Lead (เน้นหาบั๊ก/ระบบ)</option>
              <option value="business">📈 Business Analyst (เน้นยอดขาย/ความเสี่ยง)</option>
            </select>
          </div>

          <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-2xl flex flex-col items-center justify-center space-y-3 relative overflow-hidden group">
            <label className="text-xs font-bold text-slate-500 tracking-wider">📚 INJECT CONTEXT (PDF/TXT)</label>
            <input 
              type="file" 
              accept=".pdf,.txt"
              onChange={handleFileUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
            <div className={`w-full p-3 rounded-xl border border-dashed flex items-center justify-center transition-all ${isContextLoaded ? 'bg-indigo-950/30 border-indigo-500/50 text-indigo-300' : 'bg-slate-950 border-slate-700 text-slate-400 group-hover:border-indigo-500/50 group-hover:bg-slate-900'}`}>
              <span className="text-sm truncate px-2 text-center">
                {isContextLoaded ? `✅ โหลดแล้ว: ${fileName}` : "📄 คลิกเพื่ออัปโหลดไฟล์ความรู้"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex justify-center pt-4 pb-8">
          {!isRecording ? (
            <button 
              onClick={startRecording}
              className="group relative px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl shadow-[0_0_40px_-10px_rgba(79,70,229,0.5)] hover:shadow-[0_0_60px_-15px_rgba(79,70,229,0.7)] transition-all flex items-center space-x-3 overflow-hidden"
            >
              <div className="absolute inset-0 bg-white/20 w-full translate-x-[-100%] group-hover:animate-[shimmer_1.5s_infinite]"></div>
              <span className="w-3 h-3 rounded-full bg-white animate-pulse"></span>
              <span>START MICROPHONE</span>
            </button>
          ) : (
            <button 
              onClick={stopRecording}
              className="px-8 py-4 bg-rose-600/90 hover:bg-rose-500 text-white font-bold rounded-2xl shadow-[0_0_40px_-10px_rgba(225,29,72,0.4)] transition-all flex items-center space-x-3"
            >
              <span className="w-3 h-3 rounded-sm bg-white"></span>
              <span>STOP & SUMMARIZE</span>
            </button>
          )}
        </div>

        {isSummarizing && (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
            <p className="text-indigo-400 font-medium animate-pulse">AI กำลังวิเคราะห์และสรุปผลการประชุม...</p>
          </div>
        )}

        {(transcripts.length > 0 || isRecording) && !isSummarizing && (
          <div className="bg-slate-900/60 p-6 rounded-2xl border border-slate-800 shadow-xl max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-4">
              <h2 className="text-sm font-bold text-slate-400 flex items-center">
                <span className="mr-2">🔴</span> REAL-TIME TRANSCRIPT
              </h2>
              {isRecording && <span className="text-xs bg-rose-500/10 text-rose-400 px-3 py-1 rounded-full animate-pulse border border-rose-500/20">LIVE RECORDING</span>}
            </div>
            
            <div className="h-[400px] overflow-y-auto space-y-4 pr-2 custom-scrollbar">
              {transcripts.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-500 text-sm italic">รอรับเสียง... ข้อความจะขึ้นที่นี่ทุก 8 วินาที</div>
              ) : (
                transcripts.map((text, index) => (
                  <div key={index} className="text-slate-200 text-sm leading-relaxed bg-slate-900/50 p-4 rounded-xl border border-slate-900 border-l-2 border-l-indigo-500 whitespace-pre-wrap">
                    {text}
                  </div>
                ))
              )}
              <div ref={transcriptEndRef} />
            </div>
          </div>
        )}

        {summary && (
          <div className="text-left bg-slate-900/60 p-8 rounded-2xl border border-slate-800 max-w-4xl mx-auto">
            <h2 className="text-lg font-bold text-white mb-4 border-b border-slate-800 pb-3 flex items-center justify-between">
              <span>📄 MEETING EXECUTIVE REPORT ({persona.toUpperCase()})</span>
            </h2>
            <div className="text-slate-300 whitespace-pre-wrap leading-relaxed text-sm bg-slate-950/60 p-6 rounded-xl mb-6 shadow-inner">{summary}</div>
            
            <div className="flex flex-col sm:flex-row gap-4">
              <button onClick={copyToClipboard} className="flex-1 px-4 py-3 bg-slate-950 text-slate-400 font-bold text-xs rounded-xl border border-slate-800 hover:text-white transition-all">📋 COPY SUMMARY</button>
              <button onClick={downloadSummary} className="flex-1 px-4 py-3 bg-slate-950 text-slate-400 font-bold text-xs rounded-xl border border-slate-800 hover:text-white transition-all">📥 DOWNLOAD SUMMARY</button>
              {/* ปุ่มใหม่สำหรับโหลด Transcript */}
              <button onClick={downloadTranscript} className="flex-1 px-4 py-3 bg-indigo-950/50 text-indigo-300 font-bold text-xs rounded-xl border border-indigo-500/30 hover:bg-indigo-600 hover:text-white transition-all">💬 DOWNLOAD TRANSCRIPT</button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}