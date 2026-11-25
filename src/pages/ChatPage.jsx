import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { streamChat, loadHistory, checkBackendHealth } from '../api/client' // <-- Import checkBackendHealth
import Message from '../components/Message'

export default function ChatPage() {
  const [messages, setMessages] = useState([
    { role: 'bot', text: "Hi! I'm your emotion-aware assistant. How can I help?" }
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [isBackendReady, setIsBackendReady] = useState(false) // <-- New state
  
  const sessionId = useRef(localStorage.getItem('chat_sid') || 'sess-' + Math.random().toString(36).slice(2, 10))

  useEffect(() => {
    let isMounted = true;
    let timer;

    async function waitForBackend() {
      const isHealthy = await checkBackendHealth();
      
      if (!isMounted) return;

      if (isHealthy) {
        setIsBackendReady(true);
        
        // Now that backend is awake, load the history
        loadHistory(sessionId.current).then(hist => {
          if (hist.length) {
            const restored = hist.map(m => ({ role: m.role === 'user' ? 'user' : 'bot', text: m.content }))
            setMessages([{ role: 'bot', text: "Welcome back! Let's continue." }, ...restored])
          }
        }).catch(() => {})
        
      } else {
        // If not ready, check again in 3 seconds
        timer = setTimeout(waitForBackend, 3000);
      }
    }

    localStorage.setItem('chat_sid', sessionId.current)
    waitForBackend();

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [])

  const send = async () => {
    const text = input.trim()
    if (!text || busy) return
    setInput(''); setBusy(true)

    setMessages(m => [...m, { role: 'user', text }])
    setMessages(m => [...m, { role: 'bot', text: '', streaming: true }])

    const appendToken = (token) => {
      setMessages(m => {
        const copy = [...m]
        copy[copy.length - 1] = { ...copy[copy.length - 1], text: copy[copy.length - 1].text + token }
        return copy
      })
    }
    const setMeta = (meta) => {
      setMessages(m => {
        const copy = [...m]
        copy[copy.length - 1] = { ...copy[copy.length - 1], meta }
        return copy
      })
    }
    const finish = (payload) => {
      setMessages(m => {
        const copy = [...m]
        copy[copy.length - 1] = {
          ...copy[copy.length - 1],
          streaming: false,
          interactionId: payload.interaction_id,
        }
        return copy
      })
      setBusy(false)
    }

    await streamChat({
      message: text, sessionId: sessionId.current,
      onMeta: setMeta, onToken: appendToken,
      onDone: finish, onError: (err) => {
        appendToken(`[Error: ${err}]`)
        setBusy(false)
      },
    })
  }

  // --- LOADING SCREEN LOGIC ---
  if (!isBackendReady) {
    return (
      <div className="chat-page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column' }}>
        <h2>Please wait...</h2>
        <p>Waking up the backend. Render cold starts can take up to 60 seconds.</p>
        <div className="typing" style={{ marginTop: '20px' }}>● ● ●</div>
      </div>
    )
  }

  // --- NORMAL CHAT UI ---
  return (
    <div className="chat-page">
      <div className="chat-header">
        <span>🤖 MindfulAI Assistant</span>
        <Link to="/analytics" className="btn-ghost">Analytics →</Link>
      </div>
      <div className="chat-messages">
        {messages.map((m, i) => <Message key={i} {...m} />)}
        {busy && !messages[messages.length-1]?.text && <div className="typing">● ● ●</div>}
      </div>
      <div className="chat-input">
        <input value={input} onChange={e => setInput(e.target.value)}
               onKeyDown={e => e.key === 'Enter' && send()}
               placeholder="Type your message..." disabled={busy} />
        <button onClick={send} disabled={busy}>Send</button>
      </div>
    </div>
  )
}