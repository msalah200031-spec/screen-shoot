const puppeteer = require('puppeteer');
const sharp = require('sharp');
const fs = require('fs');
const axios = require('axios');
const path = require('path');
const express = require('express');

// ============================================
// 🔧 إعدادات الشيت والرينجات وUltraMessage
// (نفس الإعدادات الموجودة لديك، أبقيتها كما هي)
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
// 📦 دوال السكربت الأساسية (نفس الكود السابق)
// ============================================
async function captureSheetRanges() {
  // ... (ضع هنا كل دوال captureSheetRanges, switchSheet, calculateRangeClip بالكامل كما هي)
  // لتوفير المساحة، لم أعد كتابتها، لكن تأكد من نسخها كاملة من ملفك القديم.
}

async function mergeImages(imagePaths) {
  // ... (ضع الدالة كاملة)
}

async function sendToWhatsApp(imagePath) {
  // ... (ضع الدالة كاملة)
}

function cleanupFiles(tempFiles, mergedFile) {
  // ... (ضع الدالة كاملة)
}

// ============================================
// 🚀 تشغيل السكربت الأساسي كدالة
// ============================================
async function runScript() {
  console.log('🚀 بدء تشغيل السكربت عبر الطلب...');
  console.log('📊 عدد الرينجات:', RANGES.length);
  
  try {
    const screenshots = await captureSheetRanges();
    console.log('✅ تم التقاط', screenshots.length, 'صورة');
    
    const mergedImage = await mergeImages(screenshots);
    console.log('✅ تم دمج الصور');
    
    await sendToWhatsApp(mergedImage);
    console.log('✅ تم الإرسال بنجاح 🎉');
    
    cleanupFiles(screenshots, mergedImage);
    return { success: true, message: 'تم تنفيذ السكربت وإرسال التقرير بنجاح' };
  } catch (error) {
    console.error('❌ حدث خطأ:', error.message);
    console.error(error.stack);
    return { success: false, message: error.message };
  }
}

// ============================================
// 🌐 إنشاء خادم الويب
// ============================================
const app = express();
const PORT = process.env.PORT || 3000;

// نقطة النهاية (Endpoint) لتشغيل السكربت
app.get('/run-script1', async (req, res) => {
  console.log('📥 تم استقبال طلب على /run-script1');
  const result = await runScript();
  res.status(result.success ? 200 : 500).json(result);
});

// نقطة نهاية للتحقق من أن الخادم يعمل
app.get('/', (req, res) => {
  res.send('🚀 الخادم يعمل بنجاح! استخدم /run-script1 لتشغيل السكربت.');
});

// تشغيل الخادم
app.listen(PORT, () => {
  console.log(`✅ الخادم يعمل على المنفذ ${PORT}`);
});
