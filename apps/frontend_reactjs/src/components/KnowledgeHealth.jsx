import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, AlertTriangle, Copy, Clock, Activity, ChevronUp, ChevronDown } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

export default function KnowledgeHealth() {
  const [stats, setStats] = useState(null);
  const [issues, setIssues] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortField, setSortField] = useState('issueType');
  const [sortAsc, setSortAsc] = useState(true);

  const API_GATEWAY = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:5000';

  useEffect(() => {
    async function fetchHealthData() {
      try {
        const [statsRes, issuesRes] = await Promise.all([
          fetch(`${API_GATEWAY}/api/health/stats`),
          fetch(`${API_GATEWAY}/api/health/issues`)
        ]);
        if (!statsRes.ok) throw new Error('Failed to fetch health stats.');
        if (!issuesRes.ok) throw new Error('Failed to fetch health issues.');
        const statsJson = await statsRes.json();
        const issuesJson = await issuesRes.json();
        setStats(statsJson.data);
        setIssues(issuesJson.data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchHealthData();
  }, [API_GATEWAY]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-charcoal-1000 text-charcoal-400 font-medium">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-teal-500 mr-3"></div>
        Loading knowledge health data...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-charcoal-1000 p-6">
        <Card className="max-w-md w-full border-red-500/20 bg-red-500/10 shadow-none">
          <CardContent className="p-6 flex flex-col items-center text-center">
            <AlertTriangle className="text-red-400 mb-4" size={32} />
            <h2 className="text-lg font-semibold text-red-400 mb-2">Health Data Error</h2>
            <p className="text-sm text-red-400/80">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { trust, contradictionJobs, duplicates, freshness } = stats;

  const getTrustColor = (score) => {
    if (score >= 80) return 'text-green-400';
    if (score >= 60) return 'text-orange-400';
    return 'text-red-400';
  };

  const issueBadgeColor = (type) => {
    switch (type) {
      case 'CONTRADICTION': return 'destructive';
      case 'DUPLICATE': return 'warning';
      case 'STALE': return 'outline';
      default: return 'secondary';
    }
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const sortedIssues = [...(issues?.issues || [])].sort((a, b) => {
    let cmp = 0;
    if (sortField === 'issueType') {
      cmp = a.issueType.localeCompare(b.issueType);
    } else if (sortField === 'category') {
      cmp = (a.category || '').localeCompare(b.category || '');
    } else if (sortField === 'filename') {
      cmp = (a.filename || '').localeCompare(b.filename || '');
    } else if (sortField === 'timestamp') {
      cmp = new Date(a.timestamp) - new Date(b.timestamp);
    }
    return sortAsc ? cmp : -cmp;
  });

  const SortIcon = ({ field }) => {
    if (sortField !== field) return null;
    return sortAsc
      ? <ChevronUp size={12} className="inline ml-0.5 text-teal-400" />
      : <ChevronDown size={12} className="inline ml-0.5 text-teal-400" />;
  };

  const StatCard = ({ title, value, icon: Icon, subtitle, highlight = false, color }) => (
    <Card className={cn(
      "overflow-hidden relative border-charcoal-800 bg-charcoal-950/50 shadow-sm",
      highlight && "border-teal-500/30 bg-teal-500/5"
    )}>
      <CardContent className="p-5">
        <div className="flex justify-between items-start mb-3">
          <div className="p-2 bg-charcoal-900 rounded-md border border-charcoal-800/50">
            <Icon size={16} className={highlight ? "text-teal-400" : (color || "text-charcoal-400")} />
          </div>
        </div>
        <div>
          <h3 className="text-[11px] font-semibold text-charcoal-500 uppercase tracking-wider mb-1">{title}</h3>
          <div className={cn("text-2xl font-bold tracking-tight", highlight ? "text-teal-400" : (color || "text-charcoal-50"))}>
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
            <ShieldCheck size={22} className="text-teal-500" />
            Knowledge Health
          </h1>
          <p className="text-charcoal-400 text-sm mt-1">Repository quality signals, contradiction pipeline status, and actionable issues.</p>
        </div>
        <Link to="/">
          <Button variant="outline" size="sm" className="gap-2 bg-charcoal-900 border-charcoal-800 hover:bg-charcoal-800 hover:text-charcoal-50">
            <ArrowLeft size={14} /> Back to Workspace
          </Button>
        </Link>
      </header>

      <div className="max-w-7xl mx-auto space-y-8">
        {/* ── KPI Cards ────────────────────────────────────────── */}
        <section>
          <h2 className="text-xs font-bold text-charcoal-500 uppercase tracking-widest mb-4">Overview</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <StatCard
              title="Avg Trust Score"
              value={trust.average}
              icon={ShieldCheck}
              highlight
              subtitle={`Min ${trust.min} · Max ${trust.max}`}
            />
            <StatCard
              title="Active Contradictions"
              value={contradictionJobs.completed > 0
                ? (stats.categoryBreakdown || []).reduce((s, c) => s + c.contradictions, 0)
                : 0}
              icon={AlertTriangle}
              color="text-red-400"
              subtitle="Confirmed + possible"
            />
            <StatCard
              title="Pending Checks"
              value={contradictionJobs.pending + contradictionJobs.processing}
              icon={Activity}
              color="text-amber-400"
              subtitle={`${contradictionJobs.pending} queued · ${contradictionJobs.processing} running`}
            />
            <StatCard
              title="Duplicates"
              value={duplicates.total}
              icon={Copy}
              color="text-orange-400"
              subtitle={`${duplicates.nearDuplicates} near · ${duplicates.partialDuplicates} partial`}
            />
            <StatCard
              title="Stale Documents"
              value={freshness.staleCount}
              icon={Clock}
              color="text-yellow-400"
              subtitle={`>${freshness.staleThresholdDays}d since effective date`}
            />
          </div>
        </section>

        {/* ── Trust Distribution ──────────────────────────────── */}
        <section>
          <h2 className="text-xs font-bold text-charcoal-500 uppercase tracking-widest mb-4">Trust Score Distribution</h2>
          <div className="grid grid-cols-3 gap-4">
            {Object.entries(trust.distribution).map(([range, count]) => {
              const colors = {
                '0-40': { bar: 'bg-red-500', text: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
                '40-70': { bar: 'bg-orange-500', text: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
                '70-100': { bar: 'bg-green-500', text: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20' },
              };
              const c = colors[range] || colors['0-40'];
              const pct = trust.totalDocuments > 0 ? Math.round((count / trust.totalDocuments) * 100) : 0;
              return (
                <Card key={range} className={cn("border shadow-sm", c.bg)}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-semibold text-charcoal-400 uppercase tracking-wider">Score {range}</span>
                      <span className={cn("text-xl font-bold", c.text)}>{count}</span>
                    </div>
                    <div className="w-full h-1.5 bg-charcoal-800 rounded-full overflow-hidden">
                      <div className={cn("h-full rounded-full transition-all duration-500", c.bar)} style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-[10px] text-charcoal-500 mt-1.5">{pct}% of documents</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        {/* ── Category Breakdown Table ───────────────────────── */}
        <section>
          <h2 className="text-xs font-bold text-charcoal-500 uppercase tracking-widest mb-4">Category Breakdown</h2>
          <Card className="border-charcoal-800 bg-charcoal-950/50 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-charcoal-800 bg-charcoal-900/50">
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-charcoal-500 uppercase tracking-wider">Category</th>
                    <th className="text-right px-4 py-3 text-[11px] font-semibold text-charcoal-500 uppercase tracking-wider">Docs</th>
                    <th className="text-right px-4 py-3 text-[11px] font-semibold text-charcoal-500 uppercase tracking-wider">Avg Trust</th>
                    <th className="text-right px-4 py-3 text-[11px] font-semibold text-charcoal-500 uppercase tracking-wider">Contradictions</th>
                    <th className="text-right px-4 py-3 text-[11px] font-semibold text-charcoal-500 uppercase tracking-wider">Duplicates</th>
                    <th className="text-right px-4 py-3 text-[11px] font-semibold text-charcoal-500 uppercase tracking-wider">Stale</th>
                    <th className="text-right px-4 py-3 text-[11px] font-semibold text-charcoal-500 uppercase tracking-wider">Superseded</th>
                  </tr>
                </thead>
                <tbody>
                  {(stats.categoryBreakdown || []).map((cat, idx) => (
                    <tr key={cat.category} className={cn(
                      "border-b border-charcoal-800/50 transition-colors hover:bg-charcoal-900/30",
                      idx % 2 === 0 ? "bg-charcoal-950/30" : ""
                    )}>
                      <td className="px-4 py-3 text-charcoal-200 font-medium capitalize">{cat.category}</td>
                      <td className="px-4 py-3 text-right text-charcoal-300">{cat.totalDocs}</td>
                      <td className={cn("px-4 py-3 text-right font-semibold", getTrustColor(cat.avgTrust))}>{cat.avgTrust}</td>
                      <td className="px-4 py-3 text-right">
                        {cat.contradictions > 0
                          ? <span className="text-red-400 font-semibold">{cat.contradictions}</span>
                          : <span className="text-charcoal-600">0</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {(cat.nearDuplicates + cat.partialDuplicates) > 0
                          ? <span className="text-orange-400 font-semibold">{cat.nearDuplicates + cat.partialDuplicates}</span>
                          : <span className="text-charcoal-600">0</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {cat.stale > 0
                          ? <span className="text-yellow-400 font-semibold">{cat.stale}</span>
                          : <span className="text-charcoal-600">0</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-charcoal-500">{cat.superseded}</td>
                    </tr>
                  ))}
                  {(stats.categoryBreakdown || []).length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-6 text-center text-charcoal-500 text-sm">No categories found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </section>

        {/* ── Issues Table ───────────────────────────────────── */}
        <section>
          <h2 className="text-xs font-bold text-charcoal-500 uppercase tracking-widest mb-4">
            Issues Requiring Attention
            {issues?.totalIssues > 0 && (
              <Badge variant="destructive" className="ml-2 text-[10px]">{issues.totalIssues}</Badge>
            )}
          </h2>
          <Card className="border-charcoal-800 bg-charcoal-950/50 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-charcoal-800 bg-charcoal-900/50">
                    <th
                      className="text-left px-4 py-3 text-[11px] font-semibold text-charcoal-500 uppercase tracking-wider cursor-pointer hover:text-charcoal-300 select-none"
                      onClick={() => handleSort('filename')}
                    >
                      Filename <SortIcon field="filename" />
                    </th>
                    <th
                      className="text-left px-4 py-3 text-[11px] font-semibold text-charcoal-500 uppercase tracking-wider cursor-pointer hover:text-charcoal-300 select-none"
                      onClick={() => handleSort('category')}
                    >
                      Category <SortIcon field="category" />
                    </th>
                    <th
                      className="text-left px-4 py-3 text-[11px] font-semibold text-charcoal-500 uppercase tracking-wider cursor-pointer hover:text-charcoal-300 select-none"
                      onClick={() => handleSort('issueType')}
                    >
                      Issue Type <SortIcon field="issueType" />
                    </th>
                    <th
                      className="text-left px-4 py-3 text-[11px] font-semibold text-charcoal-500 uppercase tracking-wider cursor-pointer hover:text-charcoal-300 select-none"
                      onClick={() => handleSort('timestamp')}
                    >
                      Timestamp <SortIcon field="timestamp" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedIssues.map((issue, idx) => (
                    <tr key={`${issue.documentId}-${issue.issueType}-${idx}`} className={cn(
                      "border-b border-charcoal-800/50 transition-colors hover:bg-charcoal-900/30",
                      idx % 2 === 0 ? "bg-charcoal-950/30" : ""
                    )}>
                      <td className="px-4 py-3 text-charcoal-200 font-medium truncate max-w-[200px]" title={issue.filename}>
                        {issue.filename}
                      </td>
                      <td className="px-4 py-3 text-charcoal-400 capitalize">{issue.category}</td>
                      <td className="px-4 py-3">
                        <Badge variant={issueBadgeColor(issue.issueType)} className="text-[10px] font-semibold">
                          {issue.issueType}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-charcoal-500 text-xs">
                        {issue.timestamp ? new Date(issue.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      </td>
                    </tr>
                  ))}
                  {sortedIssues.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-charcoal-500 text-sm">
                        <ShieldCheck size={24} className="mx-auto mb-2 text-green-500/50" />
                        No issues found — knowledge base is healthy.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </section>

        {/* ── Contradiction Pipeline Status ───────────────────── */}
        <section className="pb-8">
          <h2 className="text-xs font-bold text-charcoal-500 uppercase tracking-widest mb-4">Contradiction Pipeline</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Pending', value: contradictionJobs.pending, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
              { label: 'Processing', value: contradictionJobs.processing, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
              { label: 'Completed', value: contradictionJobs.completed, color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20' },
              { label: 'Failed', value: contradictionJobs.failed, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
            ].map(item => (
              <Card key={item.label} className={cn("border shadow-sm", item.bg)}>
                <CardContent className="p-4 text-center">
                  <p className="text-[11px] font-semibold text-charcoal-500 uppercase tracking-wider mb-1">{item.label}</p>
                  <p className={cn("text-2xl font-bold", item.color)}>{item.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
