import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Bot, RotateCcw, Sparkles, ChevronDown } from 'lucide-react';
import { askQuestion, QUICK_ACTIONS } from '../services/aiChatApi';
import { runFlowStep, FLOW_CATEGORIES } from '../services/chatFlow';
import { useBranch } from '../context/BranchContext';

/**
 * ChatBot — Floating read-only AI assistant widget.
 *
 * Positioned permanently on the bottom-right of the screen.
 * Renders interactive category flows, quick action chips, natural language questions,
 * and structured data tables. All queries execute through the read-only DB RPC.
 */
const ChatBot = () => {
  const { misMode } = useBranch();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: 'bot',
      text: '👋 Hi! I am your **ARMORAA AI Assistant**. Pick a category below or ask anything about bills, stock, branches, services, staff, or audit logs.',
    },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [flowState, setFlowState] = useState(null); // active multi-step flow
  const bodyRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [messages, busy, open]);

  // Focus input when opened
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [open]);

  // Handle Escape key to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  const send = async (question) => {
    const q = String(question || '').trim();
    if (!q || busy) return;
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setInput('');
    setBusy(true);
    try {
      // If a flow is active (or this message starts one), run the flow step
      const flowResult = await runFlowStep(flowState, q);
      if (flowResult) {
        if (!flowResult.done) {
          // Ask next question
          setFlowState(flowResult.state);
          setMessages((m) => [
            ...m,
            {
              role: 'bot',
              text: flowResult.text,
              options: flowResult.options,
              prefill: flowResult.prefill,
              rows: [],
            },
          ]);
        } else {
          // Flow complete — show results
          setFlowState(null);
          setMessages((m) => [
            ...m,
            { role: 'bot', text: flowResult.text, rows: flowResult.rows, source: 'flow' },
          ]);
        }
      } else {
        // Normal single-shot question
        const { rows, text, source } = await askQuestion(q);
        setMessages((m) => [...m, { role: 'bot', text, rows, source }]);
      }
    } catch (e) {
      setMessages((m) => [...m, { role: 'bot', text: `⚠️ ${e.message}`, rows: [] }]);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setFlowState(null);
    setInput('');
    setMessages([
      {
        role: 'bot',
        text: '👋 Conversation cleared. Ask me anything about your MIS data.',
      },
    ]);
  };

  if (!misMode) return null;

  // Render **bold** segments of an answer
  const renderFormattedText = (text) => {
    const lines = String(text || '').split('\n');
    return lines.map((line, lineIdx) => {
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      return (
        <div key={lineIdx} style={{ marginBottom: lineIdx < lines.length - 1 ? 4 : 0 }}>
          {parts.map((part, i) =>
            part.startsWith('**') && part.endsWith('**') ? (
              <strong key={i} style={{ color: '#1E1B4B', fontWeight: 700 }}>
                {part.slice(2, -2)}
              </strong>
            ) : (
              <span key={i}>{part}</span>
            )
          )}
        </div>
      );
    });
  };

  const renderRows = (rows) => {
    if (!rows || rows.length === 0) return null;
    const cols = Object.keys(rows[0]);
    const fmtCell = (c) => {
      if (c == null) return '—';
      if (typeof c === 'object') return JSON.stringify(c);
      if (typeof c === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(c)) {
        return new Date(c).toLocaleString('en-IN', {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        });
      }
      return String(c);
    };

    return (
      <div
        style={{
          overflowX: 'auto',
          marginTop: 10,
          borderRadius: 8,
          border: '1px solid #E2E8F0',
          background: '#FFFFFF',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
          <thead>
            <tr style={{ background: '#F8FAFC' }}>
              {cols.map((c) => (
                <th
                  key={c}
                  style={{
                    textAlign: 'left',
                    padding: '7px 10px',
                    borderBottom: '1.5px solid #CBD5E1',
                    color: '#475569',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                    textTransform: 'capitalize',
                    letterSpacing: '0.3px',
                  }}
                >
                  {c.replace(/_/g, ' ')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={i}
                style={{
                  background: i % 2 === 0 ? '#FFFFFF' : '#F8FAFC',
                  transition: 'background 0.15s ease',
                }}
              >
                {cols.map((c) => (
                  <td
                    key={c}
                    style={{
                      padding: '6px 10px',
                      borderBottom: '1px solid #F1F5F9',
                      whiteSpace: 'nowrap',
                      color: '#1E293B',
                      fontWeight: typeof r[c] === 'number' ? 600 : 400,
                    }}
                  >
                    {fmtCell(r[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div
      className="chatbot-container"
      style={{
        position: 'fixed',
        right: 24,
        bottom: 24,
        zIndex: 9999,
        fontFamily: 'inherit',
      }}
    >
      {/* Floating Chat Window Modal */}
      {open && (
        <div
          className="chatbot-modal"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            right: 24,
            bottom: 88,
            width: 440,
            maxWidth: 'calc(100vw - 36px)',
            height: 600,
            maxHeight: 'calc(100vh - 110px)',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 18,
            boxShadow: '0 20px 50px -10px rgba(79, 70, 229, 0.25), 0 10px 25px -5px rgba(0, 0, 0, 0.12)',
            overflow: 'hidden',
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            animation: 'chatSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 16px',
              background: 'linear-gradient(135deg, #7C5CFC 0%, #4F46E5 100%)',
              color: '#FFFFFF',
              borderBottom: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backdropFilter: 'blur(4px)',
              }}
            >
              <Bot size={18} color="#FFFFFF" />
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14.5, letterSpacing: '-0.2px' }}>
                ARMORAA AI Assistant
              </div>
              <div
                style={{
                  fontSize: 11,
                  opacity: 0.9,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  marginTop: 1,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#34D399',
                    boxShadow: '0 0 8px #34D399',
                  }}
                />
                Online · MIS Intelligence
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                onClick={reset}
                title="Clear conversation"
                style={{
                  background: 'rgba(255,255,255,0.15)',
                  border: 'none',
                  borderRadius: 8,
                  padding: 6,
                  cursor: 'pointer',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.25)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
              >
                <RotateCcw size={14} />
              </button>

              <button
                onClick={() => setOpen(false)}
                title="Minimize"
                style={{
                  background: 'rgba(255,255,255,0.15)',
                  border: 'none',
                  borderRadius: 8,
                  padding: 6,
                  cursor: 'pointer',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.25)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
              >
                <ChevronDown size={16} />
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div
            ref={bodyRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '14px 16px',
              background: '#F8FAFC',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            {/* Category cards — shown until the user sends their first query */}
            {messages.length <= 1 && (
              <>
                <div style={{ marginBottom: 4 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
                    Interactive Workflows
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {FLOW_CATEGORIES.map((cat) => (
                      <button
                        key={cat.key}
                        onClick={() => send(cat.sample)}
                        disabled={busy}
                        style={{
                          textAlign: 'left',
                          padding: '10px 12px',
                          borderRadius: 12,
                          cursor: busy ? 'wait' : 'pointer',
                          border: '1px solid #E2E8F0',
                          background: '#FFFFFF',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                          transition: 'all 0.2s ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = '#7C5CFC';
                          e.currentTarget.style.transform = 'translateY(-1px)';
                          e.currentTarget.style.boxShadow = '0 4px 10px rgba(124, 92, 252, 0.12)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = '#E2E8F0';
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.03)';
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: 12.5, color: '#1E1B4B' }}>
                          {cat.label}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                          {cat.sample}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                    Quick Questions
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {QUICK_ACTIONS.map((q) => (
                      <button
                        key={q.label}
                        onClick={() => send(q.question)}
                        disabled={busy}
                        style={{
                          fontSize: 11.5,
                          fontWeight: 600,
                          padding: '5px 11px',
                          borderRadius: 999,
                          cursor: busy ? 'wait' : 'pointer',
                          border: '1px solid #E0E7FF',
                          background: '#EEF2FF',
                          color: '#4338CA',
                          transition: 'all 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#E0E7FF';
                          e.currentTarget.style.borderColor = '#C7D2FE';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = '#EEF2FF';
                          e.currentTarget.style.borderColor = '#E0E7FF';
                        }}
                      >
                        {q.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Conversation Messages */}
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                  gap: 8,
                }}
              >
                {m.role === 'bot' && (
                  <div
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #7C5CFC, #4F46E5)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  >
                    <Bot size={14} color="#FFF" />
                  </div>
                )}

                <div
                  style={{
                    maxWidth: m.role === 'user' ? '82%' : '88%',
                    padding: '10px 14px',
                    borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    fontSize: 13,
                    lineHeight: 1.5,
                    background:
                      m.role === 'user'
                        ? 'linear-gradient(135deg, #7C5CFC 0%, #4F46E5 100%)'
                        : '#FFFFFF',
                    color: m.role === 'user' ? '#FFFFFF' : '#1E293B',
                    boxShadow:
                      m.role === 'user'
                        ? '0 2px 8px rgba(79, 70, 229, 0.25)'
                        : '0 1px 4px rgba(0,0,0,0.05)',
                    border: m.role === 'user' ? 'none' : '1px solid #E2E8F0',
                  }}
                >
                  {renderFormattedText(m.text)}

                  {/* Flow Options Buttons */}
                  {m.role === 'bot' && m.options && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                      {m.options.map((o) => {
                        const label = typeof o === 'string' ? o : o.label;
                        const payload = typeof o === 'object' && o.value != null ? String(o.value) : label;
                        return (
                          <button
                            key={o && o.value != null ? `${label}:${o.value}` : label}
                            onClick={() => send(payload)}
                            disabled={busy}
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              padding: '6px 12px',
                              borderRadius: 8,
                              cursor: busy ? 'wait' : 'pointer',
                              border: 'none',
                              background: '#7C5CFC',
                              color: '#FFFFFF',
                              boxShadow: '0 2px 6px rgba(124, 92, 252, 0.3)',
                              transition: 'transform 0.15s ease, background 0.15s ease',
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = '#6D28D9')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = '#7C5CFC')}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {m.role === 'bot' && m.prefill && (
                    <div style={{ marginTop: 6, fontSize: 11, color: '#64748B' }}>
                      Suggested: <span style={{ fontWeight: 600 }}>{m.prefill}</span>
                    </div>
                  )}

                  {m.role === 'bot' && renderRows(m.rows)}

                  {m.role === 'bot' && m.source === 'llm' && (
                    <div style={{ marginTop: 6, fontSize: 10.5, color: '#64748B', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Sparkles size={11} color="#7C5CFC" /> AI-generated query (read-only)
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Thinking / Typing indicator */}
            {busy && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #7C5CFC, #4F46E5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Bot size={14} color="#FFF" />
                </div>
                <div
                  style={{
                    padding: '8px 14px',
                    borderRadius: '16px 16px 16px 4px',
                    background: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 12,
                    color: '#64748B',
                  }}
                >
                  <span className="dot-pulse" style={{ display: 'flex', gap: 4 }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#7C5CFC' }} />
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#7C5CFC' }} />
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#7C5CFC' }} />
                  </span>
                  Analyzing clinic records...
                </div>
              </div>
            )}
          </div>

          {/* Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 14px',
              background: '#FFFFFF',
              borderTop: '1px solid #E2E8F0',
            }}
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about bills, stock, doctors, usage..."
              style={{
                flex: 1,
                fontSize: 13,
                padding: '9px 14px',
                borderRadius: 10,
                border: '1.5px solid #E2E8F0',
                outline: 'none',
                transition: 'border-color 0.2s ease',
                color: '#1E293B',
              }}
              onFocus={(e) => (e.target.style.borderColor = '#7C5CFC')}
              onBlur={(e) => (e.target.style.borderColor = '#E2E8F0')}
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              style={{
                background:
                  busy || !input.trim()
                    ? '#CBD5E1'
                    : 'linear-gradient(135deg, #7C5CFC 0%, #4F46E5 100%)',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: 10,
                padding: '9px 14px',
                cursor: busy || !input.trim() ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
                boxShadow:
                  busy || !input.trim()
                    ? 'none'
                    : '0 2px 8px rgba(79, 70, 229, 0.3)',
              }}
            >
              <Send size={15} />
            </button>
          </form>
        </div>
      )}

      {/* Floating Action Button (Permanently on the Right Side) */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="ARMORAA AI Assistant"
        style={{
          width: 54,
          height: 54,
          borderRadius: '50%',
          border: 'none',
          cursor: 'pointer',
          background: 'linear-gradient(135deg, #7C5CFC 0%, #4F46E5 100%)',
          color: '#FFFFFF',
          boxShadow: '0 8px 24px rgba(79, 70, 229, 0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          position: 'relative',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.06)';
          e.currentTarget.style.boxShadow = '0 10px 28px rgba(79, 70, 229, 0.45)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = '0 8px 24px rgba(79, 70, 229, 0.35)';
        }}
      >
        {open ? <X size={22} /> : <MessageCircle size={24} />}
        {!open && (
          <span
            style={{
              position: 'absolute',
              top: -2,
              right: -2,
              background: '#10B981',
              color: '#FFFFFF',
              fontSize: 9,
              fontWeight: 800,
              padding: '2px 5px',
              borderRadius: 8,
              border: '2px solid #FFFFFF',
              boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
            }}
          >
            AI
          </span>
        )}
      </button>
    </div>
  );
};

export default ChatBot;

