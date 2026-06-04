require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const Anthropic = require('@anthropic-ai/sdk');
const cron = require('node-cron');
const { main: runCrawler } = require('./crawler');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const BASE_PROMPT = `Bạn là trợ lý tư vấn chuyên về Nhà ở xã hội tại Hà Nội. Bạn có kiến thức chuyên sâu về:

1. **Điều kiện mua/thuê nhà ở xã hội:**
   - Đối tượng được mua: cán bộ, công chức, viên chức; sĩ quan, hạ sĩ quan lực lượng vũ trang; công nhân trong khu công nghiệp; người có thu nhập thấp tại đô thị; người có công với cách mạng; người khuyết tật; hộ nghèo, cận nghèo tại đô thị; người cao tuổi cô đơn
   - Chưa có nhà ở hoặc có nhà nhưng diện tích bình quân dưới 10m²/người
   - Thu nhập không vượt ngưỡng chịu thuế thu nhập cá nhân (dưới ~11 triệu/tháng)
   - Có hộ khẩu/KT3 tại Hà Nội từ 1 năm trở lên

2. **Hồ sơ đăng ký cần chuẩn bị:**
   - Đơn đăng ký mua/thuê mua theo mẫu của Sở Xây dựng
   - CMND/CCCD bản sao có chứng thực
   - Hộ khẩu hoặc xác nhận tạm trú (KT3)
   - Giấy xác nhận thu nhập từ cơ quan/nơi làm việc
   - Giấy xác nhận chưa có nhà ở từ UBND phường/xã
   - Bản sao hợp đồng lao động (nếu là công nhân)

3. **Quy trình đăng ký:**
   - Tải mẫu đơn tại website Sở Xây dựng hoặc website chủ đầu tư
   - Nộp hồ sơ trực tiếp tại chủ đầu tư hoặc theo hướng dẫn
   - Chờ thông báo từ chủ đầu tư (thường 30 ngày sau khi hết hạn nộp hồ sơ)
   - Bốc thăm nếu số hồ sơ đủ điều kiện vượt quá số căn hộ
   - Ký hợp đồng mua bán/thuê mua

4. **Chính sách ưu đãi:**
   - Giá bán thấp hơn thị trường 30-50%
   - Được vay gói tín dụng ưu đãi lãi suất 4.8%/năm từ ngân hàng chính sách
   - Thời hạn thuê mua tối thiểu 5 năm

Nguồn thông tin chính thức: https://soxaydung.hanoi.gov.vn

Trả lời bằng tiếng Việt, thân thiện và dễ hiểu. Nếu không chắc chắn về thông tin cụ thể, hãy hướng dẫn người dùng liên hệ Sở Xây dựng Hà Nội (024 3976 1294) hoặc truy cập website chính thức.`;

function buildSystemPrompt() {
  try {
    const data = fs.readFileSync(path.join(__dirname, 'data', 'projects.json'), 'utf8');
    const projects = JSON.parse(data);
    const projectList = projects.map(p => {
      const price = p.priceFrom && p.priceTo ? `${p.priceFrom}-${p.priceTo} triệu/m²` : (p.priceFrom ? `từ ${p.priceFrom} triệu/m²` : 'chưa công bố');
      const units = p.totalUnits ? `${p.totalUnits} căn` : 'chưa rõ';
      const area = p.areaFrom && p.areaTo ? `${p.areaFrom}-${p.areaTo}m²` : 'chưa rõ';
      return `- **${p.name}** (${p.district}): ${p.address} | Trạng thái: ${p.statusLabel} | Giá: ${price} | Số căn: ${units} | Diện tích: ${area} | CĐT: ${p.developer || 'chưa rõ'}${p.deadline ? ` | Hạn nộp hồ sơ: ${p.deadline}` : ''}`;
    }).join('\n');

    return `${BASE_PROMPT}\n\n5. **Danh sách dự án hiện tại (dữ liệu cập nhật ${new Date().toLocaleDateString('vi-VN')}):**\n${projectList}`;
  } catch {
    return BASE_PROMPT;
  }
}

// API: lấy danh sách dự án
app.get('/api/projects', (req, res) => {
  try {
    const data = fs.readFileSync(path.join(__dirname, 'data', 'projects.json'), 'utf8');
    let projects = JSON.parse(data);

    const { q, district, status } = req.query;
    if (q) {
      const keyword = q.toLowerCase();
      projects = projects.filter(p =>
        p.name.toLowerCase().includes(keyword) ||
        p.address.toLowerCase().includes(keyword) ||
        p.district.toLowerCase().includes(keyword)
      );
    }
    if (district) projects = projects.filter(p => p.district === district);
    if (status) projects = projects.filter(p => p.status === status);

    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: 'Không thể đọc dữ liệu dự án' });
  }
});

// API: lấy chi tiết một dự án
app.get('/api/projects/:id', (req, res) => {
  try {
    const data = fs.readFileSync(path.join(__dirname, 'data', 'projects.json'), 'utf8');
    const projects = JSON.parse(data);
    const project = projects.find(p => p.id === parseInt(req.params.id));
    if (!project) return res.status(404).json({ error: 'Không tìm thấy dự án' });
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// API: chatbot
app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const stream = await client.messages.stream({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: buildSystemPrompt(),
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        res.write(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`);
      }
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: 'Lỗi kết nối AI. Vui lòng thử lại.' })}\n\n`);
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
});

// Tự động crawl mỗi thứ Hai lúc 2 giờ sáng
cron.schedule('0 2 * * 1', async () => {
  console.log('[Cron] Bắt đầu crawl dữ liệu tự động...');
  try {
    await runCrawler();
    console.log('[Cron] Crawl hoàn tất.');
  } catch (err) {
    console.error('[Cron] Lỗi crawl:', err.message);
  }
}, { timezone: 'Asia/Ho_Chi_Minh' });
