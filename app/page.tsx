'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { QueueSnapshot } from '@/lib/types';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
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

  // 准备图表数据
  const chartData = queueData.map(snapshot => ({
    time: format(parseISO(snapshot.timestamp), 'HH:mm', { locale: zhCN }),
    总排队: snapshot.total_lineup,
    '1-2人': snapshot.queue_details.type_a,
    '3-4人': snapshot.queue_details.type_b,
    '5-6人': snapshot.queue_details.type_c,
    '7-8人': snapshot.queue_details.type_f,
  }));

  const statsData = calculateStats();
  const latestData = queueData[queueData.length - 1];

  return (
    <div className="min-h-screen bg-linear-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold bg-linear-to-r from-red-600 to-orange-600 bg-clip-text text-transparent">
              🍲 火锅排队监控
            </h1>
            <p className="text-muted-foreground mt-2">实时排队数据</p>
          </div>
          <div className="flex items-center gap-4">
            <Select value={selectedDate} onValueChange={setSelectedDate}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="选择日期" />
              </SelectTrigger>
              <SelectContent>
                {stats?.availableDates.map(date => (
                  <SelectItem key={date} value={date}>
                    {format(parseISO(date), 'yyyy年MM月dd日', { locale: zhCN })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => fetchQueueData(selectedDate)} size="icon" variant="outline">
              <RefreshCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* 数据概览卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">数据记录</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{queueData.length}</div>
              <p className="text-xs text-muted-foreground mt-1">
                共 {stats?.totalFiles} 天数据
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">平均排队</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statsData?.avgTotal || '-'}</div>
              <p className="text-xs text-muted-foreground mt-1">
                最高 {statsData?.maxTotal || '-'} / 最低 {statsData?.minTotal || '-'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">当前排队</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{latestData?.total_lineup || '-'}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {latestData && format(parseISO(latestData.timestamp), 'HH:mm:ss', { locale: zhCN })}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">数据大小</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalSizeKB} KB</div>
              <p className="text-xs text-muted-foreground mt-1">
                {stats?.dateRange?.start} ~ {stats?.dateRange?.end}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* 排队趋势图 */}
        <Card>
          <CardHeader>
            <CardTitle>排队趋势</CardTitle>
            <CardDescription>实时排队人数变化（每 10 秒采集）</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-96 flex items-center justify-center text-muted-foreground">
                加载中...
              </div>
            ) : chartData.length === 0 ? (
              <div className="h-96 flex items-center justify-center text-muted-foreground">
                暂无数据
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="time" 
                    tick={{ fontSize: 12 }}
                    interval={Math.floor(chartData.length / 10)}
                  />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="总排队" stroke="#ef4444" strokeWidth={2} />
                  <Line type="monotone" dataKey="1-2人" stroke="#3b82f6" strokeWidth={1.5} />
                  <Line type="monotone" dataKey="3-4人" stroke="#10b981" strokeWidth={1.5} />
                  <Line type="monotone" dataKey="5-6人" stroke="#f59e0b" strokeWidth={1.5} />
                  <Line type="monotone" dataKey="7-8人" stroke="#8b5cf6" strokeWidth={1.5} />
                </LineChart>
              </ResponsiveContainer>
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
