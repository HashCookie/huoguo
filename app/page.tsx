'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { QueueSnapshot } from '@/lib/types';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Users, Clock, TrendingUp, Calendar, RefreshCcw } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface Stats {
  totalFiles: number;
  totalSizeKB: string;
  dateRange: { start: string; end: string } | null;
  availableDates: string[];
}

export default function Dashboard() {
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [queueData, setQueueData] = useState<QueueSnapshot[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  // 获取统计信息
  useEffect(() => {
    fetchStats();
  }, []);

  // 获取排队数据
  useEffect(() => {
    if (selectedDate) {
      fetchQueueData(selectedDate);
    }
  }, [selectedDate]);

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/stats');
      const data = await response.json();
      if (data.success) {
        setStats(data.stats);
        // 默认选择最新日期
        if (data.stats.availableDates.length > 0) {
          setSelectedDate(data.stats.availableDates[data.stats.availableDates.length - 1]);
        }
      }
    } catch (error) {
      console.error('获取统计失败:', error);
    }
  };

  const fetchQueueData = async (date: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/queue-data?date=${date}`);
      const data = await response.json();
      if (data.success) {
        setQueueData(data.data);
      }
    } catch (error) {
      console.error('获取数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 计算统计数据
  const calculateStats = () => {
    if (queueData.length === 0) return null;

    const avgTotal = (queueData.reduce((sum, s) => sum + s.total_lineup, 0) / queueData.length).toFixed(1);
    const maxTotal = Math.max(...queueData.map(s => s.total_lineup));
    const minTotal = Math.min(...queueData.map(s => s.total_lineup));

    const avgTypeA = (queueData.reduce((sum, s) => sum + s.queue_details.type_a, 0) / queueData.length).toFixed(1);
    const avgTypeB = (queueData.reduce((sum, s) => sum + s.queue_details.type_b, 0) / queueData.length).toFixed(1);
    const avgTypeC = (queueData.reduce((sum, s) => sum + s.queue_details.type_c, 0) / queueData.length).toFixed(1);
    const avgTypeF = (queueData.reduce((sum, s) => sum + s.queue_details.type_f, 0) / queueData.length).toFixed(1);

    return { avgTotal, maxTotal, minTotal, avgTypeA, avgTypeB, avgTypeC, avgTypeF };
  };

  // 准备并优化图表数据（针对 10s 高频采样进行降噪处理）
  const getProcessedChartData = () => {
    if (queueData.length === 0) return [];

    // 如果数据点超过 120 个（约 20 分钟），则进行抽样，保持图表清爽
    const samplingRate = Math.max(1, Math.floor(queueData.length / 120));
    
    return queueData
      .filter((_, index) => index % samplingRate === 0)
      .map(snapshot => ({
        time: format(parseISO(snapshot.timestamp), 'HH:mm', { locale: zhCN }),
        fullTime: format(parseISO(snapshot.timestamp), 'HH:mm:ss', { locale: zhCN }),
        '总人数': snapshot.total_lineup,
        '1-2人桌': snapshot.queue_details.type_a,
        '3-4人桌': snapshot.queue_details.type_b,
        '5-6人桌': snapshot.queue_details.type_c,
        '7-8人桌': snapshot.queue_details.type_f,
      }));
  };

  const chartData = getProcessedChartData();
  const statsData = calculateStats();
  const latestData = queueData[queueData.length - 1];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans selection:bg-red-100 selection:text-red-900">
      <div className="container mx-auto p-4 md:p-8 space-y-8 max-w-7xl">
        {/* Header Section */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="flex items-center gap-2 p-1.5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <Select value={selectedDate} onValueChange={setSelectedDate}>
              <SelectTrigger className="w-44 border-none bg-transparent focus:ring-0 font-semibold">
                <Calendar className="w-4 h-4 mr-2 text-slate-400" />
                <SelectValue placeholder="选择回溯日期" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {stats?.availableDates.map(date => (
                  <SelectItem key={date} value={date} className="rounded-lg">
                    {format(parseISO(date), 'MM月dd日', { locale: zhCN })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="w-px h-8 bg-slate-200 dark:bg-slate-800 mx-1" />
            <Button 
              onClick={() => fetchQueueData(selectedDate)} 
              size="icon" 
              variant="ghost" 
              className="rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-all hover:rotate-180 duration-500"
            >
              <RefreshCcw className="h-5 w-5" />
            </Button>
          </div>
        </header>

        {/* Highlight Stats (Ultra-Compact) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {/* Card 1 */}
          <Card className="border-none shadow-sm bg-white dark:bg-slate-900 rounded-xl overflow-hidden">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-400 shrink-0">
                <Clock className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight truncate">记录跨度</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-bold text-slate-900 dark:text-slate-50">{stats?.totalFiles || 0}</span>
                  <span className="text-[9px] font-medium text-slate-400">Days</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card 2 (Active) */}
          <Card className="border-none shadow-md shadow-red-500/10 bg-red-600 rounded-xl overflow-hidden">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-white shrink-0">
                <Users className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[9px] font-bold text-red-100 uppercase tracking-tight truncate">当前排队</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-black text-white">{latestData?.total_lineup || 0}</span>
                  <span className="text-[9px] font-medium text-red-100">Pax</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card 3 */}
          <Card className="border-none shadow-sm bg-white dark:bg-slate-900 rounded-xl overflow-hidden">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-400 shrink-0">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight truncate">全天平均</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-bold text-slate-900 dark:text-slate-50">{statsData?.avgTotal || 0}</span>
                  <span className="text-[9px] font-medium text-slate-400">Avg</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card 4 */}
          <Card className="border-none shadow-sm bg-white dark:bg-slate-900 rounded-xl overflow-hidden">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-400 shrink-0">
                <TrendingUp className="w-4 h-4 rotate-90" />
              </div>
              <div className="min-w-0">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight truncate">单日峰值</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-bold text-slate-900 dark:text-slate-50">{statsData?.maxTotal || 0}</span>
                  <span className="text-[9px] font-medium text-slate-400">Max</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Chart Section */}
        <Card className="border-none shadow-2xl shadow-slate-200/60 dark:shadow-none bg-white dark:bg-slate-900 rounded-[2.5rem] overflow-hidden">
          <CardHeader className="p-8 pb-0 border-none">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-50">趋势洞察</CardTitle>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary" className="rounded-lg font-bold text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 border-none">
                    采样率: {queueData.length > 200 ? '动态压缩' : '全量数据'}
                  </Badge>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 md:p-8">
            {loading ? (
              <div className="h-[450px] flex flex-col items-center justify-center space-y-4">
                <div className="relative h-16 w-16">
                  <div className="absolute inset-0 rounded-full border-4 border-red-100 dark:border-red-950/30"></div>
                  <div className="absolute inset-0 rounded-full border-4 border-red-600 border-t-transparent animate-spin"></div>
                </div>
                <p className="text-slate-400 font-bold tracking-widest text-xs uppercase animate-pulse">Processing Data...</p>
              </div>
            ) : chartData.length === 0 ? (
              <div className="h-[450px] flex flex-col items-center justify-center text-slate-400 border-4 border-dashed border-slate-50 dark:border-slate-800 rounded-[2rem]">
                <Clock className="w-12 h-12 mb-4 opacity-20" />
                <p className="font-bold">该日期段暂无数据历史</p>
              </div>
            ) : (
              <div className="h-[450px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 20, right: 30, left: 10, bottom: 10 }}>
                    <defs>
                      <linearGradient id="totalGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="typeAGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.05}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="8 8" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="time" 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fontWeight: 700, fill: '#94a3b8' }}
                      minTickGap={40}
                      dy={15}
                    />
                    <YAxis 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fontWeight: 700, fill: '#94a3b8' }}
                      dx={-10}
                    />
                    <Tooltip 
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl p-5 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-2xl space-y-3">
                              <p className="text-xs font-black text-slate-400 uppercase tracking-tighter">{payload[0].payload.fullTime}</p>
                              <div className="space-y-1.5">
                                {payload.map((entry: any, index: number) => (
                                  <div key={index} className="flex items-center justify-between gap-8">
                                    <div className="flex items-center gap-2">
                                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }}></div>
                                      <span className="text-sm font-bold text-slate-600 dark:text-slate-300">{entry.name}</span>
                                    </div>
                                    <span className="text-sm font-black text-slate-900 dark:text-slate-50">{entry.value}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Area 
                      name="总人数"
                      type="monotoneX" 
                      dataKey="总人数" 
                      stroke="#ef4444" 
                      strokeWidth={4}
                      fillOpacity={1} 
                      fill="url(#totalGradient)" 
                      animationDuration={1500}
                    />
                    <Area 
                      name="1-2人桌"
                      type="monotoneX" 
                      dataKey="1-2人桌" 
                      stroke="#3b82f6" 
                      strokeWidth={2}
                      fillOpacity={1} 
                      fill="url(#typeAGradient)" 
                    />
                    <Area 
                      name="3-4人桌"
                      type="monotoneX" 
                      dataKey="3-4人桌" 
                      stroke="#10b981" 
                      strokeWidth={2}
                      fillOpacity={0} 
                    />
                    <Area 
                      name="5-6人桌"
                      type="monotoneX" 
                      dataKey="5-6人桌" 
                      stroke="#f59e0b" 
                      strokeWidth={2}
                      fillOpacity={0} 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 各桌型统计 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">1-2 人桌</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-blue-600">{statsData?.avgTypeA || '-'}</span>
                <span className="text-sm text-muted-foreground">平均排队</span>
              </div>
              <Badge variant="secondary" className="mt-2">
                当前: {latestData?.queue_details.type_a || '-'}
              </Badge>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">3-4 人桌</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-green-600">{statsData?.avgTypeB || '-'}</span>
                <span className="text-sm text-muted-foreground">平均排队</span>
              </div>
              <Badge variant="secondary" className="mt-2">
                当前: {latestData?.queue_details.type_b || '-'}
              </Badge>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">5-6 人桌</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-orange-600">{statsData?.avgTypeC || '-'}</span>
                <span className="text-sm text-muted-foreground">平均排队</span>
              </div>
              <Badge variant="secondary" className="mt-2">
                当前: {latestData?.queue_details.type_c || '-'}
              </Badge>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">7-8 人桌</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-purple-600">{statsData?.avgTypeF || '-'}</span>
                <span className="text-sm text-muted-foreground">平均排队</span>
              </div>
              <Badge variant="secondary" className="mt-2">
                当前: {latestData?.queue_details.type_f || '-'}
              </Badge>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
