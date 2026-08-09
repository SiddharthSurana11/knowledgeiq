import React from 'react';
import { Sidebar } from './Sidebar';

export function AppLayout({ 
  children, 
  sessions, 
  activeSessionId, 
  onSessionChange, 
  onNewSession, 
  onRenameSession,
  onDeleteSession 
}) {
  return (
    <div className="flex h-screen bg-charcoal-1000 text-charcoal-50 overflow-hidden">
      <Sidebar 
        sessions={sessions || []}
        activeSessionId={activeSessionId}
        onSessionChange={onSessionChange}
        onNewSession={onNewSession}
        onRenameSession={onRenameSession}
        onDeleteSession={onDeleteSession}
      />
      <main className="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden">
        {children}
      </main>
    </div>
  );
}
