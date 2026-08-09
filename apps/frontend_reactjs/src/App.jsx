import React, { useEffect, useState } from 'react';
import { AppLayout } from './components/layout/AppLayout';
import { WorkspaceHeader } from './components/WorkspaceHeader';
import ChatBox from './components/ChatBox';

const API_GATEWAY = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:5000';

export default function App() {
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [isProcessing, setIsProcessing]= useState(false);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [error, setError] = useState(null);

  const [categories, setCategories] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [searchScope, setSearchScope] = useState('global');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterDocumentId, setFilterDocumentId] = useState('');

  useEffect(() => {
    Promise.all([
      fetch(`${API_GATEWAY}/api/categories`).then(res => res.json()),
      fetch(`${API_GATEWAY}/api/documents`).then(res => res.json())
    ]).then(([catJson, docJson]) => {
      setCategories(catJson.data || []);
      setDocuments(docJson.data || []);
    }).catch(console.error);
  }, []);

  useEffect(() => {
    async function loadSessions() {
      setLoadingSessions(true);
      setError(null);
      try {
        const res = await fetch(`${API_GATEWAY}/api/sessions`);
        if (!res.ok) throw new Error('Failed to fetch sessions');
        const json = await res.json();
        const data = json.data || [];
        setSessions(data);
        setActiveSessionId(null);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoadingSessions(false);
      }
    }
    loadSessions();
    // eslint-disable-next-line
  }, []);

  const handleSessionChange = (sessionId) => {
    setActiveSessionId(sessionId);
  };

  function handleNewSession() {
    setActiveSessionId(null);
  }

  const handleSessionCreated = (newSession) => {
    setSessions(prev => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
  };

  async function handleRenameSession(sessionId, newName) {
    await fetch(`${API_GATEWAY}/api/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName })
    });
    setSessions(prev =>
      prev.map(sess => sess.id === sessionId ? { ...sess, name: newName } : sess)
    );
  }

  async function handleDeleteSession(sessionId) {
    try {
      await fetch(`${API_GATEWAY}/api/sessions/${sessionId}`, {
        method: "DELETE"
      });
      setSessions(prev => prev.filter(sess => sess.id !== sessionId));
      if (activeSessionId === sessionId) {
        setActiveSessionId(null);
      }
    } catch (e) {
      console.error("Failed to delete session:", e);
    }
  }

  const refreshDocuments = async () => {
    try {
      const resDocs = await fetch(`${API_GATEWAY}/api/documents`);
      const jsonDocs = await resDocs.json();
      setDocuments(jsonDocs.data || []);
    } catch (e) {
      console.error("Failed to refresh documents:", e);
    }
  };

  return (
    <AppLayout
      sessions={sessions}
      activeSessionId={activeSessionId}
      onSessionChange={handleSessionChange}
      onNewSession={handleNewSession}
      onRenameSession={handleRenameSession}
      onDeleteSession={handleDeleteSession}
    >
      {/* Top Workspace Toolbar */}
      <WorkspaceHeader 
        categories={categories}
        documents={documents}
        searchScope={searchScope}
        setSearchScope={setSearchScope}
        filterCategory={filterCategory}
        setFilterCategory={setFilterCategory}
        filterDocumentId={filterDocumentId}
        setFilterDocumentId={setFilterDocumentId}
        setIsProcessing={setIsProcessing} 
        apiGateway={API_GATEWAY} 
        onDocumentUploaded={refreshDocuments}
      />
      
      {/* Main Chat Area */}
      {loadingSessions ? (
        <div className="flex-1 flex items-center justify-center bg-charcoal-1000 text-charcoal-400">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-teal-500 mr-3"></div>
          Loading sessions...
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center bg-charcoal-1000 text-red-400">
          {error}
        </div>
      ) : (
        <ChatBox
          sessionId={activeSessionId}
          isProcessing={isProcessing}
          searchScope={searchScope}
          filterCategory={filterCategory}
          filterDocumentId={filterDocumentId}
          apiGateway={API_GATEWAY}
          onSessionCreated={handleSessionCreated}
          onRenameSession={handleRenameSession}
        />
      )}
    </AppLayout>
  );
}