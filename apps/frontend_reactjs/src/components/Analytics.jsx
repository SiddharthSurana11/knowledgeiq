import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, TrendingUp, TrendingDown, Search, Database, Users, LineChart } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

export default function Analytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const API_GATEWAY = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:5000';

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        const res = await fetch(`${API_GATEWAY}/api/analytics`);
        if (!res.ok) throw new Error('Failed to fetch analytics metrics.');
        const json = await res.json();
        setData(json.data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchAnalytics();
  }, [API_GATEWAY]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-charcoal-1000 text-charcoal-400 font-medium">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-teal-500 mr-3"></div>
        Processing search logs and historical trends...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-charcoal-1000 text-red-400 font-semibold">
        ⚠️ Error: {error}
      </div>
    );
  }

  const {
    searchAnalytics,
    uploadAnalytics,
    knowledgeGrowth,
    popularSearches,
    failedSearches,
    categoryUsage,
    knowledgeTrends
  } = data;

  const StatCard = ({ title, value, subtitle, highlight = false }) => (
    <Card className={cn("overflow-hidden", highlight && "border-teal-500/50 bg-teal-500/5")}>
      <CardContent className="p-6">
        <div>
          <h3 className="text-xs font-semibold text-charcoal-400 uppercase tracking-wider mb-2">{title}</h3>
          <div className={cn("text-3xl font-bold tracking-tight", highlight ? "text-teal-400" : "text-charcoal-50")}>
            {value}
          </div>
          {subtitle && <p className="text-xs text-charcoal-500 mt-2">{subtitle}</p>}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-charcoal-1000 p-6 md:p-8 font-sans">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 max-w-7xl mx-auto">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-charcoal-50 flex items-center gap-2">
            <LineChart size={24} className="text-teal-500" />
            Enterprise Analytics
          </h1>
          <p className="text-charcoal-400 text-sm mt-1">Audit query performance, failure rates, and ingestion patterns.</p>
        </div>
        <Link to="/">
          <Button variant="outline" size="sm" className="gap-2">
            <ArrowLeft size={14} /> Back to Workspace
          </Button>
        </Link>
      </header>

      <div className="max-w-7xl mx-auto space-y-6">
        {/* KPI Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard title="Total Searches" value={searchAnalytics.totalQueries} subtitle="Queries captured" highlight />
          <StatCard title="Success Rate" value={`${searchAnalytics.successRate}%`} subtitle="Resolved with hits" />
          <StatCard title="Avg Latency" value={`${searchAnalytics.averageResponseTimeMs}ms`} subtitle="gRPC roundtrip" />
          <StatCard title="Contributors" value={uploadAnalytics.activeContributors} subtitle="Staff uploading" />
          <StatCard title="Health Avg" value={`${uploadAnalytics.averageTrustScore}%`} subtitle="Mean trust score" />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Category Usage Stats */}
          <Card className="xl:col-span-2">
            <CardHeader className="border-b border-charcoal-800">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Database size={16} className="text-teal-500" />
                Category Intelligence
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  { label: 'Most Searched', val: categoryUsage.mostSearchedCategory, variant: 'default' },
                  { label: 'Least Searched', val: categoryUsage.leastSearchedCategory, variant: 'outline' },
                  { label: 'Most Uploaded', val: categoryUsage.mostUploadedCategory, variant: 'default' },
                  { label: 'Highest Trust', val: categoryUsage.highestTrustCategory, variant: 'success' },
                  { label: 'Lowest Trust', val: categoryUsage.lowestTrustCategory, variant: 'destructive' }
                ].map((item, idx) => (
                  <div key={idx} className="p-4 rounded-xl border border-charcoal-800 bg-charcoal-950/50 flex flex-col justify-between hover:border-charcoal-700 transition">
                    <span className="text-xs font-medium text-charcoal-400 mb-3">{item.label}</span>
                    <Badge variant={item.variant} className="self-start uppercase text-[10px]">{item.val}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Knowledge Growth */}
          <Card className="xl:col-span-1">
            <CardHeader className="border-b border-charcoal-800">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp size={16} className="text-teal-500" />
                Knowledge Growth
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4 text-sm">
              <div className="flex justify-between items-center pb-2 border-b border-charcoal-800">
                <span className="text-charcoal-300">Last 24 Hours</span>
                <span className="text-charcoal-50 font-bold">{knowledgeGrowth.added24h} new</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-charcoal-800">
                <span className="text-charcoal-300">Last 7 Days</span>
                <span className="text-charcoal-50 font-bold">{knowledgeGrowth.added7d} new</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-charcoal-300">Last 30 Days</span>
                <span className="text-charcoal-50 font-bold">{knowledgeGrowth.added30d} new</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Popular and Failed Searches Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="border-b border-charcoal-800">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Search size={16} className="text-teal-500" />
                Popular Searches
              </CardTitle>
            </CardHeader>
            <div className="max-h-96 overflow-y-auto">
              <table className="min-w-full text-sm text-left">
                <thead className="bg-charcoal-950/50 text-xs uppercase text-charcoal-500 border-b border-charcoal-800">
                  <tr>
                    <th className="px-6 py-3 font-semibold">Search Query</th>
                    <th className="px-6 py-3 font-semibold text-right">Frequency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-charcoal-800">
                  {popularSearches.length === 0 ? (
                    <tr><td colSpan="2" className="p-6 text-center text-charcoal-500">No data</td></tr>
                  ) : (
                    popularSearches.map((item, idx) => (
                      <tr key={idx} className="hover:bg-charcoal-800/20">
                        <td className="px-6 py-4 text-charcoal-200 italic">"{item.query}"</td>
                        <td className="px-6 py-4 text-right text-teal-400 font-medium">{item.count}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader className="border-b border-charcoal-800">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-red-400">
                <TrendingDown size={16} />
                Failed Searches (Zero Hits)
              </CardTitle>
            </CardHeader>
            <div className="max-h-96 overflow-y-auto">
              <table className="min-w-full text-sm text-left">
                <thead className="bg-charcoal-950/50 text-xs uppercase text-charcoal-500 border-b border-charcoal-800">
                  <tr>
                    <th className="px-6 py-3 font-semibold">Failed Query</th>
                    <th className="px-6 py-3 font-semibold text-right">Frequency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-charcoal-800">
                  {failedSearches.length === 0 ? (
                    <tr><td colSpan="2" className="p-6 text-center text-charcoal-500">No failed searches recorded.</td></tr>
                  ) : (
                    failedSearches.map((item, idx) => (
                      <tr key={idx} className="hover:bg-charcoal-800/20">
                        <td className="px-6 py-4 text-charcoal-200 italic">"{item.query}"</td>
                        <td className="px-6 py-4 text-right">
                          <Badge variant="destructive" className="rounded">{item.count} failures</Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
