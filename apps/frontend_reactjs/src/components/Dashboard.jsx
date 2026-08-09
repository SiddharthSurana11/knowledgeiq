import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LayoutDashboard, ArrowLeft, Files, Activity, AlertTriangle, ShieldCheck, Database, GitBranch } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const API_GATEWAY = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:5000';

  useEffect(() => {
    async function fetchDashboard() {
      try {
        const res = await fetch(`${API_GATEWAY}/api/dashboard`);
        if (!res.ok) throw new Error('Failed to fetch dashboard statistics.');
        const json = await res.json();
        setData(json.data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchDashboard();
  }, [API_GATEWAY]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-charcoal-1000 text-charcoal-400 font-medium">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-teal-500 mr-3"></div>
        Aggregating enterprise telemetry...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-charcoal-1000 p-6">
        <Card className="max-w-md w-full border-red-500/20 bg-red-500/10 shadow-none">
          <CardContent className="p-6 flex flex-col items-center text-center">
            <AlertTriangle className="text-red-400 mb-4" size={32} />
            <h2 className="text-lg font-semibold text-red-400 mb-2">Telemetry Error</h2>
            <p className="text-sm text-red-400/80">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const {
    summary,
    topHealthy,
    highestRisk,
    recentActivity,
  } = data;

  const hasData = summary.totalDocuments > 0;

  if (!hasData) {
    return (
      <div className="h-full overflow-y-auto bg-charcoal-1000 p-6 md:p-8 font-sans flex flex-col items-center justify-center relative">
        <div className="absolute top-8 left-8">
           <Link to="/">
            <Button variant="outline" size="sm" className="gap-2 bg-charcoal-900 border-charcoal-800 hover:bg-charcoal-800 hover:text-charcoal-50">
              <ArrowLeft size={14} /> Back to Workspace
            </Button>
          </Link>
        </div>
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 bg-teal-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-teal-500/20 shadow-[0_0_30px_rgba(45,212,191,0.15)]">
            <Database size={32} className="text-teal-400" />
          </div>
          <h2 className="text-2xl font-semibold text-charcoal-50 tracking-tight">Your knowledge base is empty</h2>
          <p className="text-charcoal-400 text-sm leading-relaxed">
            Upload your first enterprise document to start generating governance metrics, analyzing trust scores, and identifying data contradictions.
          </p>
          <div className="pt-4">
            <Link to="/">
              <Button className="bg-teal-500 text-charcoal-1000 hover:bg-teal-400 font-semibold px-6 py-2">
                Go to Workspace
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const getTrustVariant = (score) => {
    if (score >= 80) return 'success';
    if (score >= 60) return 'warning';
    return 'destructive';
  };

  const getTrustColor = (score) => {
    if (score >= 80) return 'text-green-400';
    if (score >= 60) return 'text-orange-400';
    return 'text-red-400';
  };

  const StatCard = ({ title, value, icon: Icon, subtitle, highlight = false, trend }) => (
    <Card className={cn("overflow-hidden relative border-charcoal-800 bg-charcoal-950/50 shadow-sm", highlight && "border-teal-500/30 bg-teal-500/5")}>
      <CardContent className="p-5">
        <div className="flex justify-between items-start mb-3">
          <div className="p-2 bg-charcoal-900 rounded-md border border-charcoal-800/50">
            <Icon size={16} className={highlight ? "text-teal-400" : "text-charcoal-400"} />
          </div>
          {trend && (
            <div className={cn("flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-sm", trend > 0 ? "bg-green-500/10 text-green-400" : trend < 0 ? "bg-red-500/10 text-red-400" : "bg-charcoal-800 text-charcoal-400")}>
              {trend > 0 ? "↑" : trend < 0 ? "↓" : "−"} {Math.abs(trend)}%
            </div>
          )}
        </div>
        <div>
          <h3 className="text-[11px] font-semibold text-charcoal-500 uppercase tracking-wider mb-1">{title}</h3>
          <div className={cn("text-2xl font-bold tracking-tight", highlight ? "text-teal-400" : "text-charcoal-50")}>
            {value}
          </div>
          {subtitle && <p className="text-[11px] text-charcoal-500 mt-2 font-medium">{subtitle}</p>}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="h-full overflow-y-auto bg-charcoal-1000 p-6 md:p-8 font-sans">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 max-w-7xl mx-auto">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-charcoal-50 flex items-center gap-2">
            <LayoutDashboard size={22} className="text-teal-500" />
            Governance Overview
          </h1>
          <p className="text-charcoal-400 text-sm mt-1">Real-time repository health, duplication metrics, and factual disputes.</p>
        </div>
        <Link to="/">
          <Button variant="outline" size="sm" className="gap-2 bg-charcoal-900 border-charcoal-800 hover:bg-charcoal-800 hover:text-charcoal-50">
            <ArrowLeft size={14} /> Back to Workspace
          </Button>
        </Link>
      </header>

      <div className="max-w-7xl mx-auto space-y-6 pb-12">
        {/* KPI Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard 
            title="Active Documents" 
            value={summary.activeDocuments} 
            icon={Files} 
            subtitle="Indexed in vector store"
            highlight={true}
            trend={12} 
          />
          <StatCard 
            title="Avg Trust Score" 
            value={`${summary.averageTrustScore}%`} 
            icon={ShieldCheck} 
            subtitle="Global confidence rating"
            trend={4.2} 
          />
          <StatCard 
            title="Similarity Conflicts" 
            value={summary.duplicates} 
            icon={GitBranch} 
            subtitle="Identified exact duplicates"
            trend={-2.1} 
          />
          <StatCard 
            title="Factual Disputes" 
            value={summary.contradictions} 
            icon={AlertTriangle} 
            subtitle="Semantic contradictions"
            trend={0}
          />
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Recent Activity Table */}
          <Card className="lg:col-span-2 bg-charcoal-950/50 border-charcoal-800 shadow-sm">
            <CardHeader className="border-b border-charcoal-800/50 py-4">
              <CardTitle className="text-xs font-semibold flex items-center gap-2 uppercase tracking-wider text-charcoal-300">
                <Activity size={14} className="text-teal-500" />
                Recent Ingestions
              </CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-charcoal-950/20 text-[10px] uppercase text-charcoal-500 font-bold border-b border-charcoal-800/50">
                  <tr>
                    <th className="px-5 py-3 tracking-wider">Document</th>
                    <th className="px-5 py-3 tracking-wider">Category</th>
                    <th className="px-5 py-3 tracking-wider">Trust</th>
                    <th className="px-5 py-3 text-right tracking-wider">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-charcoal-800/50">
                  {recentActivity.slice(0, 6).map((act, idx) => (
                    <tr key={idx} className="hover:bg-charcoal-900/50 transition-colors">
                      <td className="px-5 py-3 font-medium text-charcoal-200 truncate max-w-[200px]" title={act.filename}>
                        {act.filename}
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant="outline" className="text-[9px] bg-charcoal-900 border-charcoal-700">{act.category}</Badge>
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant={getTrustVariant(act.trustScore)} className="text-[10px] px-2 py-0 h-5">
                          {act.trustScore}%
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-right text-charcoal-500 text-xs">
                        {act.uploadedAt ? new Date(act.uploadedAt).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                  {recentActivity.length === 0 && (
                    <tr>
                      <td colSpan="4" className="px-5 py-12 text-center text-charcoal-500 text-sm">No recent activity found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Risk Overview */}
          <div className="space-y-6">
            {highestRisk.length > 0 && (
              <Card className="bg-charcoal-950/50 border-charcoal-800 shadow-sm">
                <CardHeader className="border-b border-charcoal-800/50 py-3">
                  <CardTitle className="text-xs font-semibold text-red-400 flex items-center gap-2 uppercase tracking-wider">
                    <AlertTriangle size={14} /> High Risk Assets
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-charcoal-800/50">
                    {highestRisk.slice(0, 4).map((doc, idx) => (
                      <div key={idx} className="p-3 px-4 flex justify-between items-center hover:bg-charcoal-900/50 transition-colors">
                        <div className="truncate max-w-[160px] text-xs text-charcoal-300 font-medium" title={doc.filename}>{doc.filename}</div>
                        <span className={cn("text-xs font-bold", getTrustColor(doc.trustScore))}>{doc.trustScore}%</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {topHealthy.length > 0 && (
              <Card className="bg-charcoal-950/50 border-charcoal-800 shadow-sm">
                <CardHeader className="border-b border-charcoal-800/50 py-3">
                  <CardTitle className="text-xs font-semibold text-green-400 flex items-center gap-2 uppercase tracking-wider">
                    <ShieldCheck size={14} /> Validated Assets
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-charcoal-800/50">
                    {topHealthy.slice(0, 4).map((doc, idx) => (
                      <div key={idx} className="p-3 px-4 flex justify-between items-center hover:bg-charcoal-900/50 transition-colors">
                        <div className="truncate max-w-[160px] text-xs text-charcoal-300 font-medium" title={doc.filename}>{doc.filename}</div>
                        <span className={cn("text-xs font-bold", getTrustColor(doc.trustScore))}>{doc.trustScore}%</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
