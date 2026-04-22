import React, { useState, useEffect, useRef } from 'react';
import { BookOpen, Settings, Play, ArrowRight, RefreshCw, CheckCircle, XCircle, Loader2, Terminal, Database } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';

// ==========================================
// ⚠️ VERCEL DEPLOYMENT CONFIGURATION ⚠️
const VERCEL_FIREBASE_CONFIG = {
  apiKey: "AIzaSyAiWE2rhKlLJxeAowE0Bbh0-ZDsW-tL0V8",
  authDomain: "cyber-vocab.firebaseapp.com",
  projectId: "cyber-vocab",
  storageBucket: "cyber-vocab.firebasestorage.app",
  messagingSenderId: "893617789930",
  appId: "1:893617789930:web:aca3383e35c6464a01b093",
  measurementId: "G-C3534XSSMF"
};
// ==========================================

const configString = typeof __firebase_config !== 'undefined' ? __firebase_config : null;
const configToUse = configString ? JSON.parse(configString) : VERCEL_FIREBASE_CONFIG;

// ★ここを変えることで、前のアプリと単語帳データを分けることができます
const rawAppId = typeof __app_id !== 'undefined' ? __app_id : 'sub-cyber-vocab';
const appId = String(rawAppId).replace(/\//g, '-');

let app, auth, db;
if (configToUse) {
  try {
    app = initializeApp(configToUse);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (e) {
    console.error("Firebase init error", e);
  }
}

const initialRawData = `to pop a CD in
CDを入れる
to hit play
再生する
What’s the ruch?
何をそんなに急いでるの？
scalp
頭皮`;

const parseVocabularyData = (text) => {
  const lines = text.split('\n').map(line => line.trim()).filter(line => line !== '');
  const vocabList = [];
  for (let i = 0; i < lines.length; i += 2) {
    if (i + 1 < lines.length) {
      vocabList.push({ en: lines[i], ja: lines[i + 1] });
    }
  }
  return vocabList;
};

const shuffleArray = (array) => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

export default function App() {
  const [currentView, setCurrentView] = useState('home');
  const SYNC_DOC_ID = 'my_private_vocab_data'; 
  const MAX_QUESTIONS = 40; 
  
  const [user, setUser] = useState(null);
  const [isDbConnected, setIsDbConnected] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  
  const [rawData, setRawData] = useState(initialRawData);
  const [vocabList, setVocabList] = useState([]);
  
  const [quizQuestions, setQuizQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [isAnswerCorrect, setIsAnswerCorrect] = useState(null);
  const [score, setScore] = useState(0);
  const [incorrectAnswers, setIncorrectAnswers] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const saveTimerRef = useRef(null);

  useEffect(() => {
    if (!auth) return;
    const initAuth = async () => {
      try { 
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth); 
        }
      } catch (e) { console.error("Auth error", e); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if(u) setIsDbConnected(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !db) {
      if (!db || !configToUse) {
        const saved = localStorage.getItem(`vocabData_local_lite`);
        if (saved) setRawData(saved);
      }
      return;
    }

    setIsSyncing(true);
    const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'vocabSync', 'my_vocab_data');
    
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.rawData && data.rawData !== rawData) setRawData(data.rawData);
      } else {
        const localSaved = localStorage.getItem(`vocabData_local_lite`);
        if(localSaved) {
            setRawData(localSaved);
            setDoc(docRef, { rawData: localSaved, updatedAt: new Date().toISOString() }, { merge: true });
        }
      }
      setIsSyncing(false);
    }, (err) => {
      console.error("Sync error", err);
      setIsSyncing(false);
    });

    return () => unsubscribe();
  }, [user, db, currentView]);

  useEffect(() => {
    setVocabList(parseVocabularyData(rawData));
    localStorage.setItem(`vocabData_local_lite`, rawData);
  }, [rawData]);

  const handleDataChange = (newData) => {
    setRawData(newData);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (user && db) {
        setIsSyncing(true);
        try {
          const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'vocabSync', 'my_vocab_data');
          await setDoc(docRef, { rawData: newData, updatedAt: new Date().toISOString() }, { merge: true });
        } catch (err) {
          console.error("Save error", err);
        } finally {
          setIsSyncing(false);
        }
      }
    }, 1000);
  };

  const generateDummyOptionsWithAI = async (selectedVocab) => {
    const apiKey = ""; // 本番環境のAPIキーを維持
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

    const prompt = `あなたは英語学習のための優秀なクイズ作成アシスタントです。
以下の英単語と正解の日本語訳のリストに対して、四択クイズ用の「不正解の選択肢（ダミー）」をそれぞれ3つずつ生成してください。
ダミーの選択肢は、正解の日本語訳と品詞や分野が似ていて、学習者が迷うような「それっぽい」自然な日本語にしてください。

入力:
${JSON.stringify(selectedVocab.map(v => ({en: v.en, ja: v.ja})))}`;

    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              en: { type: "STRING" },
              dummyOptions: { type: "ARRAY", items: { type: "STRING" } }
            },
            required: ["en", "dummyOptions"]
          }
        }
      }
    };

    let delay = 1000;
    for (let i = 0; i < 5; i++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        return JSON.parse(data.candidates[0].content.parts[0].text);
      } catch (error) {
        if (i === 4) throw error;
        await new Promise(r => setTimeout(r, delay));
        delay *= 2;
      }
    }
  };

  const generateNewQuiz = async () => {
    if (vocabList.length < 4) {
      alert("クイズを作成するには最低4つの単語ペアが必要です。設定から単語を追加してください。");
      return;
    }
    setIsGenerating(true);
    
    const questionCount = Math.min(MAX_QUESTIONS, vocabList.length);
    const shuffledVocab = shuffleArray(vocabList);
    const selectedVocab = shuffledVocab.slice(0, questionCount);
    let questions = [];

    try {
      const aiResponse = await generateDummyOptionsWithAI(selectedVocab);
      const aiArray = Array.isArray(aiResponse) ? aiResponse : [];
      
      questions = selectedVocab.map(correctItem => {
        const aiItem = aiArray.find(item => item.en === correctItem.en);
        let wrongOptions = [];
        if (aiItem && aiItem.dummyOptions && aiItem.dummyOptions.length >= 3) {
           wrongOptions = aiItem.dummyOptions.slice(0, 3);
        } else {
           wrongOptions = vocabList.filter(item => item.en !== correctItem.en).sort(() => 0.5 - Math.random()).slice(0, 3).map(item => item.ja);
        }
        const allOptions = shuffleArray([correctItem.ja, ...wrongOptions]);
        return { question: correctItem.en, correctAnswer: correctItem.ja, options: allOptions };
      });
    } catch (error) {
      questions = selectedVocab.map(correctItem => {
        const wrongOptions = vocabList.filter(item => item.en !== correctItem.en).sort(() => 0.5 - Math.random()).slice(0, 3).map(item => item.ja);
        const allOptions = shuffleArray([correctItem.ja, ...wrongOptions]);
        return { question: correctItem.en, correctAnswer: correctItem.ja, options: allOptions };
      });
    }

    setQuizQuestions(questions);
    setCurrentQuestionIndex(0);
    setScore(0);
    setIncorrectAnswers([]);
    setSelectedAnswer(null);
    setIsAnswerCorrect(null);
    setIsGenerating(false);
    setCurrentView('quiz');
  };

  const restartCurrentQuiz = () => {
    const reshuffledQuestions = shuffleArray(quizQuestions).map(q => ({
      ...q, options: shuffleArray(q.options)
    }));
    setQuizQuestions(reshuffledQuestions);
    setCurrentQuestionIndex(0);
    setScore(0);
    setIncorrectAnswers([]);
    setSelectedAnswer(null);
    setIsAnswerCorrect(null);
    setCurrentView('quiz');
  };

  const handleAnswerSelect = (option) => {
    if (selectedAnswer !== null) return;
    const correct = option === quizQuestions[currentQuestionIndex].correctAnswer;
    setSelectedAnswer(option);
    setIsAnswerCorrect(correct);

    if (correct) {
      setScore(prev => prev + 1);
    } else {
      setIncorrectAnswers(prev => [...prev, {
        question: quizQuestions[currentQuestionIndex].question,
        correctAnswer: quizQuestions[currentQuestionIndex].correctAnswer,
        userAnswer: option
      }]);
    }
  };

  const handleNextQuestion = () => {
    if (currentQuestionIndex < quizQuestions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      setSelectedAnswer(null);
      setIsAnswerCorrect(null);
    } else {
      setCurrentView('result');
    }
  };

  // --- 画面コンポーネント ---

  const HomeView = () => (
    <div 
      className="flex flex-col items-center justify-center min-h-[75vh] text-center px-4 relative overflow-hidden border-y-2 md:border-2 border-green-500 shadow-[0_0_30px_rgba(34,197,94,0.2)] md:rounded-lg w-full bg-gray-900"
    >
      <div className="absolute inset-0 z-0 opacity-10" style={{ 
        backgroundImage: 'linear-gradient(rgba(34, 197, 94, 0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(34, 197, 94, 0.5) 1px, transparent 1px)', 
        backgroundSize: '20px 20px' 
      }}></div>
      
      <div className="relative z-10 flex flex-col items-center w-full max-w-md">
        <div className="bg-black/80 p-5 border border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.6)] mb-6 transform rotate-45">
          <BookOpen className="w-10 h-10 text-green-400 transform -rotate-45" />
        </div>
        
        <h1 className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-b from-green-300 to-green-600 tracking-widest mb-4 drop-shadow-[0_0_10px_rgba(34,197,94,0.8)] font-mono">
          SUB_VOCAB
        </h1>
        
        <div className="bg-black/60 p-4 border-l-4 border-blue-600 shadow-[0_0_15px_rgba(0,0,0,0.8)] mb-10 w-full text-left font-mono">
          <p className="text-gray-300 text-sm leading-relaxed">
            &gt;&gt; MISSION OBJECTIVE:
            <br/>
            Decode {Math.min(MAX_QUESTIONS, vocabList.length)} random data packets.
          </p>
          <div className="flex items-center justify-between mt-3 border-t border-gray-800 pt-3">
            <p className="text-blue-400 font-black text-xs tracking-widest">
              [ DB: {vocabList.length} ENTITIES ]
            </p>
            <div className="flex items-center gap-1 text-xs font-bold">
              {configToUse ? (
                <span className="text-green-500 flex items-center gap-1"><Database className="w-3 h-3"/> CLOUD_SYNCED</span>
              ) : (
                <span className="text-yellow-500 flex items-center gap-1"><Database className="w-3 h-3"/> LOCAL_MODE</span>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex flex-col gap-4 w-full font-mono">
          <button 
            onClick={generateNewQuiz}
            disabled={isGenerating}
            className="w-full bg-black/80 border border-green-500 hover:bg-green-500 hover:text-black text-green-400 font-black py-4 px-6 shadow-[0_0_15px_rgba(34,197,94,0.4)] transition-all flex items-center justify-center gap-3 tracking-widest disabled:opacity-50"
          >
            {isGenerating ? (
              <><Loader2 className="w-6 h-6 animate-spin" />DECRYPTING...</>
            ) : (
              <><Play className="w-6 h-6 fill-current" />START_HACKING</>
            )}
          </button>
          
          <button 
            onClick={() => setCurrentView('settings')}
            className="w-full bg-black/80 border border-blue-600 hover:bg-blue-600 hover:text-black text-blue-400 font-bold py-3 px-6 shadow-[0_0_10px_rgba(37,99,235,0.3)] transition-all flex items-center justify-center gap-3 tracking-widest"
          >
            <Settings className="w-5 h-5" />OVERRIDE_DATABASE
          </button>
        </div>
      </div>
    </div>
  );

  const QuizView = () => {
    const question = quizQuestions[currentQuestionIndex];
    const isFinished = currentQuestionIndex >= quizQuestions.length - 1 && selectedAnswer !== null;

    return (
      <div className={`max-w-2xl mx-auto w-full px-4 font-mono transition-transform duration-75`}>
        
        <div className="flex justify-between items-center mb-6 text-sm border-b border-gray-800 pb-2">
          <span className="text-blue-500 font-bold tracking-widest">
            SECTOR: {currentQuestionIndex + 1} // {quizQuestions.length}
          </span>
          <span className="text-green-400 font-bold tracking-widest drop-shadow-[0_0_5px_rgba(34,197,94,0.8)]">
            SCORE: {score}
          </span>
        </div>

        <div className="w-full bg-gray-900 h-2 mb-8 border border-gray-800 relative overflow-hidden">
          <div 
            className="bg-green-500 h-full transition-all duration-300 shadow-[0_0_10px_rgba(34,197,94,1)] relative"
            style={{ width: `${((currentQuestionIndex) / quizQuestions.length) * 100}%` }}
          >
            <div className="absolute inset-0 bg-white/20 w-full animate-[slideRight_1s_infinite]"></div>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-700 shadow-[0_0_20px_rgba(0,0,0,0.8)] p-8 mb-6 text-center relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-green-500 to-transparent opacity-50 group-hover:opacity-100 transition-opacity"></div>
          <p className="text-gray-500 text-xs mb-2 tracking-widest">&gt; TARGET DATA DETECTED</p>
          <h2 className="text-3xl md:text-4xl font-black text-gray-100 mb-2 tracking-wide drop-shadow-md">
            {question.question}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {question.options.map((option, index) => {
            let buttonClass = "bg-black border border-gray-700 hover:border-blue-500 hover:shadow-[0_0_15px_rgba(59,130,246,0.4)] text-gray-300 font-medium py-4 px-6 transition-all text-left relative overflow-hidden";
            let icon = null;

            if (selectedAnswer !== null) {
              if (option === question.correctAnswer) {
                buttonClass = "bg-green-950/40 border border-green-500 text-green-400 font-bold py-4 px-6 relative shadow-[inset_0_0_20px_rgba(34,197,94,0.2)]";
                icon = <CheckCircle className="w-6 h-6 text-green-400 absolute right-4 top-1/2 transform -translate-y-1/2 drop-shadow-[0_0_8px_rgba(34,197,94,1)]" />;
              } else if (option === selectedAnswer) {
                buttonClass = "bg-red-950/40 border border-red-600 text-red-400 font-bold py-4 px-6 relative shadow-[inset_0_0_20px_rgba(220,38,38,0.2)]";
                icon = <XCircle className="w-6 h-6 text-red-500 absolute right-4 top-1/2 transform -translate-y-1/2 drop-shadow-[0_0_8px_rgba(220,38,38,1)]" />;
              } else {
                buttonClass = "bg-black border border-gray-800 text-gray-600 font-medium py-4 px-6 opacity-40";
              }
            }

            return (
              <button
                key={index}
                onClick={() => handleAnswerSelect(option)}
                disabled={selectedAnswer !== null}
                className={buttonClass}
              >
                <span className="text-xs text-gray-600 mr-2 opacity-50">[{index + 1}]</span>
                {option}
                {icon}
              </button>
            );
          })}
        </div>

        {selectedAnswer !== null && (
          <div className="mt-8 flex justify-center animate-fade-in relative z-20">
            <button
              onClick={handleNextQuestion}
              className="bg-green-500 hover:bg-green-400 text-black font-black py-3 px-8 shadow-[0_0_20px_rgba(34,197,94,0.6)] transition-all flex items-center gap-2 tracking-widest uppercase"
            >
              {isFinished ? 'GENERATE REPORT' : 'NEXT SECTOR'}
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    );
  };

  const ResultView = () => (
    <div className="max-w-2xl mx-auto w-full px-4 text-center font-mono">
      <div className="mb-10">
        <p className="text-gray-500 text-sm tracking-widest mb-2">&gt; CONNECTION TERMINATED</p>
        <h2 className="text-3xl md:text-4xl font-black text-green-400 mb-2 tracking-widest drop-shadow-[0_0_10px_rgba(34,197,94,0.6)]">MISSION COMPLETE</h2>
        
        <div className="inline-block bg-black border border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.2)] p-6 mt-6 min-w-[250px]">
          <p className="text-gray-400 mb-2 tracking-widest text-sm">SUCCESS RATE</p>
          <p className="text-6xl font-black text-green-400 drop-shadow-[0_0_15px_rgba(34,197,94,0.8)]">
            {score} <span className="text-2xl text-gray-600 font-bold">/ {quizQuestions.length}</span>
          </p>
        </div>
      </div>

      {incorrectAnswers.length > 0 && (
        <div className="text-left bg-gray-900 border border-gray-700 shadow-xl p-6 mb-8 relative">
          <div className="absolute top-0 left-0 w-1 h-full bg-red-600"></div>
          <h3 className="text-xl font-black text-blue-400 mb-4 border-b border-gray-800 pb-2 tracking-widest">ERROR LOG: REVIEW REQUIRED</h3>
          <ul className="space-y-4">
            {incorrectAnswers.map((item, index) => (
              <li key={index} className="bg-black p-4 border border-gray-800">
                <p className="font-bold text-gray-200 text-lg tracking-wide">{item.question}</p>
                <div className="mt-3 text-sm grid grid-cols-[auto_1fr] gap-2 items-start">
                  <span className="text-red-500 font-bold">ERR:</span>
                  <span className="text-red-400 line-through opacity-80">{item.userAnswer}</span>
                  
                  <span className="text-green-500 font-bold">VAL:</span>
                  <span className="text-green-400 font-bold drop-shadow-[0_0_3px_rgba(34,197,94,0.5)]">{item.correctAnswer}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {incorrectAnswers.length === 0 && (
        <div className="bg-green-950/40 p-6 border border-green-500 mb-8 shadow-[0_0_20px_rgba(34,197,94,0.3)]">
          <p className="text-green-400 font-black text-lg tracking-widest animate-pulse">FLAWLESS EXECUTION. NO ERRORS DETECTED.</p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-center gap-4 flex-wrap">
        <button
          onClick={restartCurrentQuiz}
          className="bg-black border border-blue-500 hover:bg-blue-900/50 text-blue-400 font-bold py-3 px-6 transition-all flex items-center justify-center gap-2 shadow-[0_0_10px_rgba(59,130,246,0.3)] tracking-widest"
        >
          <RefreshCw className="w-5 h-5" />
          RETRY_CURRENT
        </button>
        <button
          onClick={generateNewQuiz}
          disabled={isGenerating}
          className="bg-black border border-purple-500 hover:bg-purple-900/50 disabled:border-gray-700 disabled:text-gray-600 text-purple-400 font-bold py-3 px-6 transition-all flex items-center justify-center gap-2 shadow-[0_0_10px_rgba(168,85,247,0.3)] tracking-widest"
        >
          {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 fill-current" />}
          {isGenerating ? 'GENERATING...' : 'NEW_MISSION'}
        </button>
        <button
          onClick={() => {
            setCurrentView('home');
          }}
          className="bg-gray-900 border border-gray-700 hover:bg-gray-800 text-gray-400 font-bold py-3 px-6 transition-all tracking-widest"
        >
          HOME
        </button>
      </div>
    </div>
  );

  const SettingsView = () => (
    <div className="max-w-3xl mx-auto w-full px-4 flex flex-col h-[80vh] font-mono">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-black text-green-400 tracking-widest drop-shadow-[0_0_8px_rgba(34,197,94,0.5)]">DATABASE_OVERRIDE</h2>
          <p className="text-xs text-gray-500 mt-1 uppercase tracking-widest">Input target entities for processing</p>
        </div>
        <button
          onClick={() => setCurrentView('home')}
          className="text-blue-500 hover:text-blue-400 hover:underline font-bold tracking-widest border border-blue-500/30 px-3 py-1 bg-blue-950/20"
        >
          SAVE_&_EXIT
        </button>
      </div>

      <div className="bg-yellow-950/30 border-l-2 border-yellow-600 p-4 mb-4 text-xs text-yellow-500">
        <p className="font-bold mb-1 tracking-widest">&gt; SYSTEM ALERT: FORMAT RULE</p>
        <p>Ensure data is paired: [EN Line 1] \n [JP Line 2]</p>
      </div>

      <textarea
        className="flex-1 w-full p-5 bg-black border border-green-800 text-green-400 focus:border-green-400 focus:ring-1 focus:ring-green-400 focus:outline-none resize-none font-mono text-sm shadow-[inset_0_0_20px_rgba(0,0,0,1)] selection:bg-green-500 selection:text-black leading-loose"
        value={rawData}
        onChange={(e) => handleDataChange(e.target.value)}
        placeholder="apple&#10;りんご&#10;dog&#10;犬"
      />
      
      <div className="mt-4 flex justify-between items-center text-xs text-gray-500 border-t border-gray-800 pt-3">
        <span>INDEXED_ENTITIES: <span className="font-bold text-green-400 text-sm ml-1 drop-shadow-[0_0_5px_rgba(34,197,94,0.8)]">{vocabList.length}</span></span>
        {isSyncing ? (
          <span className="text-yellow-500 flex items-center gap-1"><RefreshCw className="w-3 h-3 animate-spin" /> SYNCING...</span>
        ) : configToUse ? (
          <span className="text-green-600 animate-pulse flex items-center gap-1"><Database className="w-3 h-3" /> CLOUD SAVED</span>
        ) : (
          <span className="text-gray-600">LOCAL SAVED</span>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200 font-sans py-8 selection:bg-green-500 selection:text-black relative">
      <div 
        className="fixed inset-0 pointer-events-none z-0 opacity-20" 
        style={{ 
          backgroundImage: 'linear-gradient(rgba(34, 197, 94, 0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(34, 197, 94, 0.2) 1px, transparent 1px)', 
          backgroundSize: '40px 40px' 
        }}>
      </div>
      
      <header className="max-w-4xl mx-auto px-4 mb-8 relative z-10 flex justify-between items-center">
        <div className="flex items-center gap-2 text-green-500 font-black text-xl tracking-widest drop-shadow-[0_0_10px_rgba(34,197,94,0.5)]">
          <Terminal className="w-7 h-7" />
          <span>SYS::VOCAB (LITE)</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto flex items-center justify-center relative z-10">
        {currentView === 'home' && HomeView()}
        {currentView === 'quiz' && QuizView()}
        {currentView === 'result' && ResultView()}
        {currentView === 'settings' && SettingsView()}
      </main>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideRight {
          from { transform: translateX(-100%); }
          to { transform: translateX(100%); }
        }
        .animate-fade-in { animation: fadeIn 0.3s ease-out forwards; }
      `}} />
    </div>
  );
}