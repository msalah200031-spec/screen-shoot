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
// 📸 تصوير رينجات الشيت (موفر للذاكرة)
// ============================================
async function captureSheetRanges() {
  console.log("🚀 Launching browser (memory optimized)...");
  
  const browser = await puppeteer.launch({
    headless: "new",
    protocolTimeout: 60000, // قللنا الوقت عشان ما يعلق
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-zygote",
      // تم إزالة --single-process عشان يخفف الذاكرة
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-default-apps",
      "--disable-sync",
      "--disable-translate",
      "--hide-scrollbars",
      "--metrics-recording-only",
      "--mute-audio",
      "--no-default-browser-check",
      "--no-first-run",
      "--no-pings",
      "--password-store=basic",
      "--use-mock-keychain",
      "--disable-component-extensions-with-background-pages",
      "--disable-features=TranslateUI,BlinkGenPropertyTrees",
      "--disable-ipc-flooding-protection",
      "--disable-renderer-backgrounding",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-breakpad",
      "--disable-crash-reporter",
      "--disable-domain-reliability",
      "--disable-print-preview",
      // تقليل استهلاك الذاكرة
      "--memory-pressure-off",
      "--max_old_space_size=256"
    ]
  });

  console.log("✅ Browser launched (PID: " + (browser.process() ? browser.process().pid : 'unknown') + ")");

  browser.on("disconnected", () => {
    console.log("❌ Browser disconnected (crash or forced close)");
  });

  console.log("📄 Creating page...");
  const page = await browser.newPage();
  console.log("✅ Page created");

  // تصغير حجم الـ Viewport جداً لتوفير الذاكرة
  await page.setViewport({ 
    width: 1024,   // من 1280 إلى 1024
    height: 600,   // من 800 إلى 600
    deviceScaleFactor: 1  // من 1.5 إلى 1
  });

  console.log('🌐 جاري فتح الشيت...');
  
  try {
    await page.goto(SHEET_URL, { 
      waitUntil: 'domcontentloaded', // أسرع من networkidle2
      timeout: 30000 // قللنا الوقت
    });
    
    // انتظار ظهور الجدول
    await page.waitForSelector('.waffle', { timeout: 15000 });
    console.log('✅ تم تحميل الشيت');
    
    // تنظيف DOM من العناصر غير الضرورية لتوفير الذاكرة
    await page.evaluate(() => {
      // إزالة الإعلانات والعناصر الجانبية
      const ads = document.querySelectorAll('[class*="ad"], [id*="ad"], .docs-sidebar, .docs-gmh');
      ads.forEach(el => el.remove());
      
      // تقليل الـ zoom
      document.body.style.zoom = '1';
    });
    
  } catch (error) {
    console.error('❌ فشل في تحميل الشيت:', error.message);
    await browser.close();
    return [];
  }

  const screenshots = [];
  let currentSheet = '';

  for (let i = 0; i < RANGES.length; i++) {
    const { name, sheet, range } = RANGES[i];
    console.log(`  📸 تصوير ${i + 1}/${RANGES.length}: ${name}`);

    try {
      if (sheet !== currentSheet) {
        console.log(`  📑 التبديل إلى تاب: ${sheet}`);
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
        await page.waitForTimeout(500); // قللنا الوقت
      }

      // حساب الرينج
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

          const padding = 10; // قللنا الـ padding
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

      // التقاط الصورة بجودة أقل لتوفير الذاكرة
      const screenshot = await page.screenshot({
        clip: clip,
        type: 'png',
        quality: 70, // جودة 70% بدلاً من 100%
        optimizeForSpeed: true
      });

      const tempPath = path.join('/tmp', `temp_${name}.png`);
      fs.writeFileSync(tempPath, screenshot);
      screenshots.push(tempPath);
      console.log(`  ✅ تم حفظ ${name} (${(screenshot.length / 1024).toFixed(1)} KB)`);
      
    } catch (error) {
      console.error(`  ❌ فشل في تصوير ${name}:`, error.message);
      // لا نوقف السكربت، نكمل باقي الرينجات
    }
    
    // تنظيف الذاكرة بعد كل صورة
    if (i % 2 === 0) {
      console.log('  🧹 تنظيف الذاكرة...');
      await page.evaluate(() => {
        if (window.gc) window.gc();
      }).catch(() => {});
    }
  }

  console.log('🧹 جاري إغلاق المتصفح...');
  await browser.close();
  console.log('✅ تم إغلاق المتصفح');
  
  return screenshots;
}

// ============================================
// 🖼️ دمج الصور (محسن)
// ============================================
async function mergeImages(imagePaths) {
  try {
    if (!imagePaths || imagePaths.length === 0) {
      throw new Error('لا توجد صور لدمجها');
    }

    console.log(`🖼️ جاري دمج ${imagePaths.length} صور...`);
    
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
        channels: 3, // قللنا من 4 إلى 3 (توفير ذاكرة)
        background: { r: 255, g: 255, b: 255 }
      }
    })
    .composite(compositeImages)
    .png({ compressionLevel: 9, quality: 70 }) // ضغط أعلى
    .toBuffer();

    const outputPath = path.join('/tmp', 'merged_report.png');
    fs.writeFileSync(outputPath, mergedBuffer);
    console.log(`✅ تم الدمج (${(mergedBuffer.length / 1024).toFixed(1)} KB)`);
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
    if (mergedFile && fs.existsSync(mergedFile)) fs.unlinkSync(mergedFile);
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
  const startTime = Date.now();
  
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
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`⏱️ تم التنفيذ في ${duration} ثانية`);
    
    return { success: true, message: `تم التنفيذ بنجاح في ${duration} ثانية` };
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
