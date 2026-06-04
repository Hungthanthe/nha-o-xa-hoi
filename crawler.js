/**
 * Crawler dữ liệu nhà ở xã hội từ Sở Xây dựng Hà Nội
 * Chạy: node crawler.js
 */
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://soxaydung.hanoi.gov.vn';
const NOXH_URL = `${BASE_URL}/vi-vn/trang/nha-o-xa-hoi/536304`;

const delay = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchPage(url) {
  try {
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
      },
      timeout: 15000,
    });
    return res.data;
  } catch (err) {
    console.error(`Lỗi khi tải ${url}:`, err.message);
    return null;
  }
}

function extractProjectFromArticle($, article) {
  const title = $(article).find('h2, h3, .title, .article-title').first().text().trim();
  const link = $(article).find('a').first().attr('href');
  const snippet = $(article).find('p, .description, .excerpt').first().text().trim();
  const date = $(article).find('.date, time, .published').first().text().trim();

  return { title, link: link ? `${BASE_URL}${link}` : null, snippet, date };
}

async function crawlListPage(url) {
  console.log(`Đang crawl: ${url}`);
  const html = await fetchPage(url);
  if (!html) return [];

  const $ = cheerio.load(html);
  const articles = [];

  // Tìm các bài viết trên trang danh sách
  $('article, .item, .news-item, li.row').each((_, el) => {
    const data = extractProjectFromArticle($, el);
    if (data.title) articles.push(data);
  });

  // Nếu không tìm được qua article, thử các selector khác
  if (articles.length === 0) {
    $('a[href*="nha-o-xa-hoi"], a[href*="536304"]').each((_, el) => {
      const title = $(el).text().trim();
      const href = $(el).attr('href');
      if (title && title.length > 10) {
        articles.push({ title, link: href?.startsWith('http') ? href : `${BASE_URL}${href}`, snippet: '', date: '' });
      }
    });
  }

  return articles;
}

async function crawlDetailPage(url) {
  if (!url) return null;
  console.log(`  Chi tiết: ${url}`);
  await delay(1000);

  const html = await fetchPage(url);
  if (!html) return null;

  const $ = cheerio.load(html);

  const title = $('h1, h2.title, .article-title').first().text().trim();
  const content = $('.article-content, .content, main article').text().trim();
  const publishDate = $('time, .date, .published').first().text().trim();

  // Trích xuất thông tin dự án từ nội dung
  const info = {
    title,
    content: content.substring(0, 2000),
    publishDate,
    sourceUrl: url,
  };

  // Tìm tên dự án
  const projectMatch = content.match(/dự án\s+[""]?([^""\n]+)[""]?/i);
  if (projectMatch) info.projectName = projectMatch[1].trim();

  // Tìm địa chỉ
  const addressMatch = content.match(/(?:tại|địa điểm|địa chỉ)[:\s]+([^\n.]+)/i);
  if (addressMatch) info.address = addressMatch[1].trim();

  // Tìm số lượng căn hộ
  const unitsMatch = content.match(/(\d+)\s*(?:căn|căn hộ)/i);
  if (unitsMatch) info.totalUnits = parseInt(unitsMatch[1]);

  // Tìm giá bán
  const priceMatch = content.match(/(\d+(?:[.,]\d+)?)\s*triệu\/m²/i);
  if (priceMatch) info.price = priceMatch[1];

  return info;
}

async function mergeWithExisting(newData) {
  const existingPath = path.join(__dirname, 'data', 'projects.json');
  let existing = [];
  if (fs.existsSync(existingPath)) {
    existing = JSON.parse(fs.readFileSync(existingPath, 'utf8'));
  }

  // Thêm các bài viết mới dưới dạng source references
  const crawledSources = newData.filter(item => item.title && item.title.length > 5).map((item, idx) => ({
    id: existing.length + idx + 1,
    name: item.projectName || item.title,
    address: item.address || 'Hà Nội',
    district: '',
    developer: '',
    status: 'sap-mo-ban',
    statusLabel: 'Xem thông tin',
    round: '',
    totalUnits: item.totalUnits || 0,
    availableUnits: 0,
    priceFrom: 0,
    priceTo: 0,
    areaFrom: 0,
    areaTo: 0,
    floors: 9,
    description: item.content?.substring(0, 500) || '',
    conditions: [],
    documents: [],
    sourceUrl: item.sourceUrl,
    lat: 21.0285,
    lng: 105.8048,
    images: [],
    deadline: null,
    updatedAt: new Date().toISOString().split('T')[0],
    isCrawled: true,
  }));

  const merged = [...existing, ...crawledSources];
  return merged;
}

async function main() {
  console.log('=== Bắt đầu crawl dữ liệu Nhà ở xã hội Hà Nội ===\n');

  const articles = await crawlListPage(NOXH_URL);
  console.log(`\nTìm thấy ${articles.length} bài viết\n`);

  const details = [];
  for (const article of articles.slice(0, 10)) { // Giới hạn 10 bài để tránh bị chặn
    if (article.link) {
      const detail = await crawlDetailPage(article.link);
      if (detail) details.push(detail);
      await delay(2000);
    }
  }

  if (details.length > 0) {
    const merged = await mergeWithExisting(details);
    fs.writeFileSync(
      path.join(__dirname, 'data', 'projects.json'),
      JSON.stringify(merged, null, 2),
      'utf8'
    );
    console.log(`\nĐã lưu ${details.length} dự án mới vào data/projects.json`);
  } else {
    console.log('\nKhông crawl được dữ liệu mới. Giữ nguyên dữ liệu hiện có.');
  }

  console.log('\n=== Hoàn tất ===');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };
