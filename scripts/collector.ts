import axios from 'axios';
import dayjs from 'dayjs';
import { ApiResponse, QueueSnapshot, StoreInfo } from '@/lib/types';

/**
 * 数据采集器
 * 负责调用朱富贵火锅 API 并提取门店排队数据
 */
export class DataCollector {
  private apiUrl = 'https://xcx.zhufuguihuoguo.com/api/item/lists';
  private targetStoreId = 19; // 厦门火车站禹悦汇店

  /**
   * 获取门店列表（筛选厦门火车站禹悦汇店）
   */
  async fetchStoreData(): Promise<StoreInfo | null> {
    try {
      const response = await axios.post<ApiResponse>(
        this.apiUrl,
        { search: '禹悦汇' },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 10000, // 10秒超时
        }
      );

      if (response.data.code !== 1) {
        console.error('❌ API 返回错误:', response.data.msg);
        return null;
      }

      // 筛选门店 ID=19
      const targetStore = response.data.data.find(
        store => store.id === this.targetStoreId
      );

      if (!targetStore) {
        console.warn('⚠️ 未找到目标门店 (ID=19)');
        return null;
      }

      return targetStore;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('❌ 网络请求失败:', error.message);
      } else {
        console.error('❌ 未知错误:', error);
      }
      return null;
    }
  }

  /**
   * 将门店数据转换为快照格式
   */
  transformToSnapshot(storeInfo: StoreInfo): QueueSnapshot {
    const queueDetails = {
      type_a: 0,
      type_b: 0,
      type_c: 0,
      type_f: 0,
      type_t: 0,
    };

    // 提取各桌型排队人数
    storeInfo.all_lineup.forEach(queue => {
      switch (queue.type) {
        case 'A':
          queueDetails.type_a = queue.num;
          break;
        case 'B':
          queueDetails.type_b = queue.num;
          break;
        case 'C':
          queueDetails.type_c = queue.num;
          break;
        case 'F':
          queueDetails.type_f = queue.num;
          break;
        case 'T':
          queueDetails.type_t = queue.num;
          break;
      }
    });

    return {
      timestamp: dayjs().toISOString(),
      store_id: storeInfo.id,
      store_name: storeInfo.title,
      total_lineup: storeInfo.lineup,
      queue_details: queueDetails,
      raw_data: storeInfo,
    };
  }

  /**
   * 执行一次完整的数据采集
   */
  async collect(): Promise<QueueSnapshot | null> {
    console.log(`\n🔄 [${dayjs().format('YYYY-MM-DD HH:mm:ss')}] 开始采集数据...`);

    const storeData = await this.fetchStoreData();

    if (!storeData) {
      return null;
    }

    const snapshot = this.transformToSnapshot(storeData);

    console.log(`📊 排队数据: 1-2人=${snapshot.queue_details.type_a}, ` +
      `3-4人=${snapshot.queue_details.type_b}, ` +
      `5-6人=${snapshot.queue_details.type_c}, ` +
      `7-8人=${snapshot.queue_details.type_f}, ` +
      `总计=${snapshot.total_lineup}`);

    return snapshot;
  }
}
