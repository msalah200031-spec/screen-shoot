const puppeteer = require('puppeteer');
const sharp = require('sharp');
const fs = require('fs');
const axios = require('axios');
const path = require('path');

// ============================================
// 🔧 إعدادات الشيت
// ============================================
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1PJ9a_ca2XBmrus8n_xFhtHcIfeJDDHAumJefdTxgSiU/edit?gid=1237273820#gid=1237273820';

// ============================================
// 📊 الرينجات المطلوبة (تاب واحد بس)
// ============================================
const RANGES = [
  { name: 'Total', sheet: 'Total', range: 'A1:H13' },
  { name: 'أصين المشرفين_1', sheet: 'أصين المشرفين', range: 'A1:Q47' },
  { name: 'أصين المشرفين_2', sheet: 'أصين المشرفين', range: 'A48:Q120' },
  { name: 'مناديب الإضافات', sheet: 'مناديب الإضافات', range: 'A1:M50' }
];

// ============================================
// 📱 إعدادات UltraMessage
// ============================================
const ULTRA_CONFIG = {
  instanceId: 'instance182369',
  token: 'se5izbk4b0f7go05',
  groupId: '120363165151444296@g.us'
};

// ============================================
// 🎯 الدالة الرئيسية
// ============================================
async function main() {
  console.log('🚀 بدء تشغيل السكربت...');
  console.log('📊 عدد الرينجات المطلوب تصويرها:', RANGES.length);
  
  try {
    // 1️⃣ التقاط الصور من الشيت
    console.log('📸 جاري تصوير الشيت...');
    const screenshots = await captureSheetRanges();
    console.log('✅ تم التقاط', screenshots.length, 'صورة');
    
    // 2️⃣ دمج الصور في صورة واحدة
    console.log('🖼️ جاري دمج الصور...');
    const mergedImage = await mergeImages(screenshots);
    console.log('✅ تم الدمج بنجاح');
    
    // 3️⃣ إرسال الصورة للواتساب
    console.log('📤 جاري إرسال الصورة للجروب...');
    await sendToWhatsApp(mergedImage);
    console.log('✅ تم الإرسال بنجاح 🎉');
    
    // 4️⃣ تنظيف الملفات المؤقتة
    cleanupFiles(screenshots, mergedImage);
    
  } catch (error) {
    console.error('❌ حدث خطأ:', error.message);
    console.error(error.stack);
  }
}

// ============================================
// 📸 تصوير رينجات الشيت
// ============================================
async function captureSheetRanges() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  await page.setViewport({
    width: 1920,
    height: 1080,
    deviceScaleFactor: 2
  });
  
  console.log('🌐 جاري فتح الشيت...');
  await page.goto(SHEET_URL, {
    waitUntil: 'networkidle2',
    timeout: 60000
  });
  
  await page.waitForSelector('.waffle', { timeout: 30000 });
  console.log('✅ تم تحميل الشيت');
  
  // تكبير لعرض أوضح
  await page.evaluate(() => {
    document.body.style.zoom = '1.2';
  });
  await page.waitForTimeout(2000);
  
  const screenshots = [];
  let currentSheet = '';
  
  for (let i = 0; i < RANGES.length; i++) {
    const { name, sheet, range } = RANGES[i];
    console.log(`  📸 تصوير ${i + 1}/${RANGES.length}: ${name} (${range})`);
    
    // تغيير التاب إذا لزم الأمر
    if (sheet !== currentSheet) {
      console.log(`  📑 التبديل إلى تاب: ${sheet}`);
      await switchSheet(page, sheet);
      currentSheet = sheet;
      await page.waitForTimeout(1500);
    }
    
    // حساب إحداثيات الرينج
    const clip = await calculateRangeClip(page, range);
    
    if (!clip) {
      console.log(`  ⚠️ تعذر حساب الرينج ${name}، تخطي...`);
      continue;
    }
    
    // التقاط الصورة
    const screenshot = await page.screenshot({
      clip: clip,
      type: 'png'
    });
    
    const tempPath = path.join('/tmp', `temp_${name}.png`);
    fs.writeFileSync(tempPath, screenshot);
    screenshots.push(tempPath);
    
    console.log(`  ✅ تم حفظ ${name}`);
    await page.waitForTimeout(500);
  }
  
  await browser.close();
  return screenshots;
}

// ============================================
// 📑 التبديل بين التابات
// ============================================
async function switchSheet(page, sheetName) {
  try {
    await page.evaluate((name) => {
      // البحث عن علامات التبويب
      const tabs = document.querySelectorAll('.docs-sheet-tab');
      for (const tab of tabs) {
        if (tab.textContent.trim() === name) {
          tab.click();
          return true;
        }
      }
      
      // طريقة بديلة باستخدام القائمة المنسدلة
      const dropdown = document.querySelector('.docs-sheet-tab-menu-button');
      if (dropdown) {
        dropdown.click();
        // البحث في القائمة
        const items = document.querySelectorAll('.goog-menuitem');
        for (const item of items) {
          if (item.textContent.trim() === name) {
            item.click();
            return true;
          }
        }
      }
      return false;
    }, sheetName);
  } catch (error) {
    console.log(`  ⚠️ مشكلة في التبديل إلى ${sheetName}:`, error.message);
  }
}

// ============================================
// 📐 حساب إحداثيات الرينج (محسّن)
// ============================================
async function calculateRangeClip(page, range) {
  return await page.evaluate((rangeStr) => {
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
      
      // جمع كل الخلايا في النطاق
      for (let i = startRow - 1; i < Math.min(endRow, rows.length); i++) {
        const cells = rows[i].querySelectorAll('td, th');
        if (cells.length === 0) continue;
        
        // نأخذ أول وآخر خلية في الصف
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
      
      // إضافة هامش للصورة
      const padding = 20;
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
}

// ============================================
// 🖼️ دمج الصور
// ============================================
async function mergeImages(imagePaths) {
  try {
    const images = await Promise.all(
      imagePaths.map(async (path) => {
        const buffer = fs.readFileSync(path);
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
        left: Math.floor((maxWidth - img.metadata.width) / 2), // توسيط
        width: img.metadata.width,
        height: img.metadata.height
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
    
    console.log('📱 رد الـ API:', response.data);
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
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
        console.log(`  🗑️ حذف: ${path.basename(file)}`);
      }
    }
    
    if (fs.existsSync(mergedFile)) {
      // نخلي الملف عشان نستخدمه تاني لو احتجنا
      console.log(`  📁 الملف النهائي: ${mergedFile}`);
    }
    
    console.log('✅ تم التنظيف بنجاح');
  } catch (error) {
    console.log('⚠️ تحذير: مشكلة في التنظيف', error.message);
  }
}

// ============================================
// 🏃 تشغيل السكربت
// ============================================
main();
