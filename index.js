const puppeteer = require('puppeteer');
const sharp = require('sharp');
const fs = require('fs');
const axios = require('axios');
const path = require('path');
const express = require('express');

// ============================================
// 🔧 إعدادات الشيت والرينجات وUltraMessage
// ============================================
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1PJ9a_ca2XBmrus8n_xFhtHcIfeJDDHAumJefdTxgSiU/edit?gid=1237273820#gid=1237273820';

const RANGES = [
  { name: 'Total', sheet: 'Total', range: 'A1:H13' },
  { name: 'أصين المشرفين_1', sheet: 'أصين المشرفين', range: 'A1:Q47' },
  { name: 'أصين المشرفين_2', sheet: 'أصين المشرفين', range: 'A48:Q120' },
  { name: 'مناديب الإضافات', sheet: 'مناديب الإضافات', range: 'A1:M50' }
];

const ULTRA_CONFIG = {
  instanceId: 'instance182369',
  token: 'se5izbk4b0f7go05',
  groupId: '120363165151444296@g.us'
};

// ============================================
// 📸 تصوير رينجات الشيت (محسّن للأداء)
// ============================================
async function captureSheetRanges() {
  // إعدادات خفيفة لتوفير الذاكرة
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/usr/bin/google-chrome-stable',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-sync',
      '--disable-translate',
      '--hide-scrollbars',
      '--metrics-recording-only',
      '--mute-audio',
      '--no-default-browser-check',
      '--no-pings',
      '--password-store=basic',
      '--use-mock-keychain'
    ]
  });

  const page = await browser.newPage();
  
  // تقليل حجم الصفحة لتوفير الذاكرة
  await page.setViewport({ 
    width: 1280, 
    height: 800, 
    deviceScaleFactor: 1.5 
  });

  console.log('🌐 جاري فتح الشيت...');
  
  try {
    await page.goto(SHEET_URL, { 
      waitUntil: 'domcontentloaded', 
      timeout: 45000 
    });
    
    // انتظار ظهور الجدول
    await page.waitForSelector('.waffle', { timeout: 20000 });
    console.log('✅ تم تحميل الشيت');
  } catch (error) {
    console.error('❌ فشل في تحميل الشيت:', error.message);
    await browser.close();
    return [];
  }

  // تكبير بسيط
  await page.evaluate(() => {
    document.body.style.zoom = '1.1';
  });
  await page.waitForTimeout(1500);

  const screenshots = [];
  let currentSheet = '';

  for (let i = 0; i < RANGES.length; i++) {
    const { name, sheet, range } = RANGES[i];
    console.log(`  📸 تصوير ${i + 1}/${RANGES.length}: ${name}`);

    if (sheet !== currentSheet) {
      console.log(`  📑 التبديل إلى تاب: ${sheet}`);
      try {
        await page.evaluate((name) => {
          const tabs = document.querySelectorAll('.docs-sheet-tab');
          for (const tab of tabs) {
            if (tab.textContent.trim() === name) {
              tab.click();
              return true;
            }
          }
          return false;
        }, sheet);
        currentSheet = sheet;
        await page.waitForTimeout(1000);
      } catch (error) {
        console.log(`  ⚠️ مشكلة في التبديل إلى ${sheet}`);
        continue;
      }
    }

    // حساب الرينج باستخدام طريقة أكثر استقراراً
    const clip = await page.evaluate((rangeStr) => {
      try {
        const table = document.querySelector('.waffle');
        if (!table) return null;

        const [start, end] = rangeStr.split(':');
        const startRow = parseInt(start.match(/\d+/)[0]);
        const endRow = parseInt(end.match(/\d+/)[0]);
        const rows = table.querySelectorAll('tr');

        let minX = Infinity, minY = Infinity;
        let maxX = 0, maxY = 0;
        let found = false;

        for (let i = startRow - 1; i < Math.min(endRow, rows.length); i++) {
          const cells = rows[i].querySelectorAll('td, th');
          if (cells.length === 0) continue;

          const firstCell = cells[0];
          const lastCell = cells[cells.length - 1];
          const rect1 = firstCell.getBoundingClientRect();
          const rect2 = lastCell.getBoundingClientRect();

          if (i === startRow - 1) {
            minX = rect1.x;
            minY = rect1.y;
          }
          maxX = Math.max(maxX, rect2.x + rect2.width);
          maxY = Math.max(maxY, rect2.y + rect2.height);
          found = true;
        }

        if (!found) return null;

        const padding = 15;
        return {
          x: Math.max(0, minX - padding),
          y: Math.max(0, minY - padding),
          width: (maxX - minX) + (padding * 2),
          height: (maxY - minY) + (padding * 2)
        };
      } catch (e) {
        return null;
      }
    }, range);

    if (!clip) {
      console.log(`  ⚠️ تعذر حساب الرينج ${name}، تخطي...`);
      continue;
    }

    try {
      const screenshot = await page.screenshot({
        clip: clip,
        type: 'png',
        quality: 80
      });

      const tempPath = path.join('/tmp', `temp_${name}.png`);
      fs.writeFileSync(tempPath, screenshot);
      screenshots.push(tempPath);
      console.log(`  ✅ تم حفظ ${name}`);
    } catch (error) {
      console.error(`  ❌ فشل في تصوير ${name}:`, error.message);
    }
  }

  await browser.close();
  return screenshots;
}

// ============================================
// 🖼️ دمج الصور
// ============================================
async function mergeImages(imagePaths) {
  try {
    if (!imagePaths || imagePaths.length === 0) {
      throw new Error('لا توجد صور لدمجها');
    }

    const images = await Promise.all(
      imagePaths.map(async (p) => {
        const buffer = fs.readFileSync(p);
        const metadata = await sharp(buffer).metadata();
        return { buffer, metadata };
      })
    );

    const maxWidth = Math.max(...images.map(img => img.metadata.width));
    const totalHeight = images.reduce((sum, img) => sum + img.metadata.height, 0);

    const compositeImages = [];
    let yOffset = 0;

    for (const img of images) {
      compositeImages.push({
        input: img.buffer,
        top: yOffset,
        left: Math.floor((maxWidth - img.metadata.width) / 2)
      });
      yOffset += img.metadata.height;
    }

    const mergedBuffer = await sharp({
      create: {
        width: maxWidth,
        height: totalHeight,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      }
    })
    .composite(compositeImages)
    .png()
    .toBuffer();

    const outputPath = path.join('/tmp', 'merged_report.png');
    fs.writeFileSync(outputPath, mergedBuffer);
    return outputPath;
  } catch (error) {
    console.error('❌ خطأ في دمج الصور:', error);
    throw error;
  }
}

// ============================================
// 📤 إرسال للواتساب
// ============================================
async function sendToWhatsApp(imagePath) {
  try {
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');

    const now = new Date();
    const dateStr = now.toLocaleDateString('ar-EG');
    const timeStr = now.toLocaleTimeString('ar-EG');

    const data = {
      instanceId: ULTRA_CONFIG.instanceId,
      token: ULTRA_CONFIG.token,
      to: ULTRA_CONFIG.groupId,
      message: `📊 *تقرير الأداء اليومي*\n📅 ${dateStr} - ${timeStr}\n\n✅ تم تحديث البيانات بنجاح`,
      media: base64Image,
      filename: 'report.png'
    };

    const response = await axios.post(
      `https://api.ultramsg.com/${ULTRA_CONFIG.instanceId}/messages/image`,
      new URLSearchParams(data),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 30000
      }
    );

    console.log('📱 تم الإرسال بنجاح');
    return response.data;
  } catch (error) {
    console.error('❌ خطأ في الإرسال:', error.response?.data || error.message);
    throw error;
  }
}

// ============================================
// 🧹 تنظيف الملفات
// ============================================
function cleanupFiles(tempFiles, mergedFile) {
  console.log('🧹 جاري تنظيف الملفات المؤقتة...');
  try {
    for (const file of tempFiles) {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    console.log('✅ تم التنظيف');
  } catch (error) {
    console.log('⚠️ تحذير في التنظيف');
  }
}

// ============================================
// 🚀 تشغيل السكربت
// ============================================
async function runScript() {
  console.log('🚀 بدء تشغيل السكربت...');
  
  try {
    const screenshots = await captureSheetRanges();

    if (!screenshots || screenshots.length === 0) {
      return { success: false, message: 'لم يتم التقاط أي صور' };
    }

    console.log('✅ تم التقاط', screenshots.length, 'صورة');

    const mergedImage = await mergeImages(screenshots);
    console.log('✅ تم دمج الصور');

    await sendToWhatsApp(mergedImage);
    console.log('✅ تم الإرسال 🎉');

    cleanupFiles(screenshots, mergedImage);
    return { success: true, message: 'تم التنفيذ بنجاح' };
  } catch (error) {
    console.error('❌ خطأ:', error.message);
    return { success: false, message: error.message };
  }
}

// ============================================
// 🌐 خادم الويب
// ============================================
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/run-script1', async (req, res) => {
  console.log('📥 طلب على /run-script1');
  const result = await runScript();
  res.status(result.success ? 200 : 500).json(result);
});

app.get('/', (req, res) => {
  res.send('🚀 الخادم يعمل! استخدم /run-script1');
});

app.listen(PORT, () => {
  console.log(`✅ الخادم يعمل على المنفذ ${PORT}`);
});
