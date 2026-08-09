import React, { useEffect, useRef, useState } from 'react';
import { Send, Settings2, Loader2 } from 'lucide-react';
import ChatMessage from './ChatMessage';
import { Button } from './ui/button';
import { Input } from './ui/input';

export default function ChatBox({ sessionId, isProcessing, searchScope, filterCategory, filterDocumentId, apiGateway, onSessionCreated, onRenameSession }) {
  const [message, setMessage] = useState('');
  const [chat, setChat] = useState([]);

  const chatEndRef = useRef(null);
  const inputRef = useRef(null);
  const sessionCreatedByMe = useRef(false);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);



  useEffect(() => {
    if (!sessionId) {
      setChat([{
        role: 'bot',
        text: "Hi there. I'm KnowledgeIQ. Ask me anything about your enterprise documents, guidelines, or architectural specifications."
      }]);
      return;
    }

    if (sessionCreatedByMe.current) {
      sessionCreatedByMe.current = false;
      return;
    }

    fetch(`${apiGateway}/api/sessions/${sessionId}`)
      .then(res => res.json())
      .then(json => {
        const data = json.data || {};
        const msgs = data.messages || [];
        if (msgs.length === 0) {
          const welcome = {
            role: 'bot',
            text: "Hi there. I'm KnowledgeIQ. Ask me anything about your enterprise documents, guidelines, or architectural specifications."
          };
          setChat([welcome]);
          fetch(`${apiGateway}/api/sessions/${sessionId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(welcome),
          });
        } else {
          setChat(msgs);
        }
      })
      .catch(() => {
        setChat([{
          role: 'bot',
          text: '⚠️ Unable to load previous messages. You can still chat normally.'
        }]);
      });
  }, [sessionId, apiGateway]);

  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = async () => {
    if (!message.trim() || isProcessing || isLoading) return;

    let targetSessionId = sessionId;
    if (!targetSessionId) {
      try {
        const res = await fetch(`${apiGateway}/api/sessions`, { method: "POST" });
        if (!res.ok) throw new Error('Failed to create session');
        const json = await res.json();
        const newSession = json.data || {};
        targetSessionId = newSession.id;
        sessionCreatedByMe.current = true;
        if (onSessionCreated) onSessionCreated(newSession);
      } catch (err) {
        setChat(prev => [...prev, { role: 'bot', text: '❌ Failed to create session.' }]);
        return;
      }
    }

    const newUserMsg = { role: 'user', text: message };
    const updatedChat = [...chat, newUserMsg];
    setChat(updatedChat);
    setMessage('');
    setIsLoading(true);

    try {
      const msgRes = await fetch(`${apiGateway}/api/sessions/${targetSessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUserMsg),
      });
      const msgJson = await msgRes.json();
      if (msgJson?.data?.name && onRenameSession) {
        onRenameSession(targetSessionId, msgJson.data.name);
      }

      const res = await fetch(`${apiGateway}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: targetSessionId,
          message: newUserMsg.text,
          scope: searchScope || 'global',
          category: filterCategory || undefined,
          documentId: filterDocumentId || undefined,
          history: updatedChat
            .filter(msg => msg.role === 'user' || msg.role === 'bot')
            .filter(msg => !msg.text.includes('[No response returned') && !msg.text.includes('⚠️ No response') && !msg.text.includes('❌ Failed')),
        }),
      });

      const json = await res.json();
      const data = json.data || {};
      const newBotMsg = {
        role: 'bot',
        text: data.reply || '⚠️ No response received from backend.',
        question: newUserMsg.text,
        documentHits: data.document_hits || [],
        resourceType: data.resource_type || 'Unknown',
      };

      await fetch(`${apiGateway}/api/sessions/${targetSessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newBotMsg),
      });

      setChat(prev => [...prev, newBotMsg]);
    } catch (err) {
      setChat(prev => [
        ...prev,
        { role: 'bot', text: '❌ Failed to connect to backend.' },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-charcoal-1000 relative">

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto min-h-0 pb-32">
        {chat.map((msg, idx) => (
          <ChatMessage 
            key={idx}
            role={msg.role}
            text={msg.text}
            question={msg.question}
            documentHits={msg.documentHits}
            resourceType={msg.resourceType}
          />
        ))}
        {isLoading && (
          <div className="w-full py-6 px-4 md:px-6 flex border-b border-charcoal-800/50 bg-charcoal-1000 animate-pulse">
            <div className="max-w-4xl mx-auto flex w-full gap-6">
              <div className="shrink-0 mt-1 w-8 h-8 rounded bg-teal-500/20 text-teal-400 flex items-center justify-center border border-teal-500/30">
                <Loader2 size={16} className="animate-spin text-teal-400" />
              </div>
              <div className="flex-1 flex items-center text-sm font-medium text-teal-400/90 gap-2">
                <span>KnowledgeIQ is searching enterprise documents and synthesizing answer...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={chatEndRef} className="h-4" />
      </div>

      {/* Input Area */}
      <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-charcoal-1000 via-charcoal-1000 to-transparent pt-10 pb-6 px-4 md:px-8">
        <div className="max-w-4xl mx-auto relative group">
          <textarea
            ref={inputRef}
            disabled={isProcessing}
            className="w-full bg-charcoal-900 border border-charcoal-800 rounded-2xl pl-6 pr-14 py-4 text-sm text-charcoal-50 shadow-[0_0_20px_rgba(0,0,0,0.5)] focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/50 transition-all resize-none min-h-[60px] max-h-[200px] disabled:opacity-50"
            placeholder={isProcessing ? "Processing..." : "Ask KnowledgeIQ..."}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!isProcessing) sendMessage();
              }
            }}
            rows={1}
          />
          <Button
            size="icon"
            onClick={sendMessage}
            disabled={isProcessing || !message.trim()}
            className="absolute right-3 bottom-3 h-9 w-9 rounded-xl bg-teal-500 text-charcoal-1000 hover:bg-teal-400 disabled:bg-charcoal-800 disabled:text-charcoal-500 transition-colors"
          >
            <Send size={16} className={message.trim() ? "translate-x-0.5" : ""} />
          </Button>
        </div>
        <div className="text-center mt-3 text-[11px] text-charcoal-500 font-medium">
          KnowledgeIQ can make mistakes. Consider verifying important information.
        </div>
      </div>
    </div>
  );
}
