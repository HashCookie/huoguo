/**
 * 朱富贵火锅 API 数据类型定义
 */

// 排队类型定义
export interface QueueType {
  item_id?: number;
  type: string; // 'T' | 'A' | 'B' | 'C' | 'F'
  min_num: string | number;
  max_num: string | number;
  num: number; // 当前排队人数
}

// 门店信息
export interface StoreInfo {
  id: number;
  title: string;
  city_name: string;
  address: string;
  mobile: string;
  latitude: string;
  longitude: string;
  starttime: string;
  endtime: string;
  tags: string;
  status: number;
  switch: number;
  lineup: number; // 总排队人数
  distance: string;
  is_limit: number;
  all_lineup: QueueType[];
}

// API 响应
export interface ApiResponse {
  code: number;
  msg: string;
  time: string;
  data: StoreInfo[];
}

// 快照数据（保存到本地）
export interface QueueSnapshot {
  timestamp: string; // ISO 8601 格式
  store_id: number;
  store_name: string;
  total_lineup: number;
  queue_details: {
    type_a: number; // 1-2人
    type_b: number; // 3-4人
    type_c: number; // 5-6人
    type_f: number; // 7-8人
    type_t: number; // 总计
  };
  raw_data: StoreInfo; // 保留原始数据
}
