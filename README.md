# BULAALE MINI MARKET - Nidaamka Iibka Maxalliga ah (100% Offline POS System)

نظام كاشير ومبيعات وإدارة مخزون محلي (100% Offline POS) متكامل وسريع، يعمل محلياً ويخزن جميع البيانات على الحاسوب.

---

## 🚀 كيفية التشغيل في VS Code والحاسوب (How to Run in VS Code)

### 1. فتح المشروع في VS Code:
- افتح مجلد المشروع داخل برنامج **Visual Studio Code (VS Code)**.

### 2. فتح الطرفية (Terminal):
- اضغط `Ctrl + \`` أو اختر من القائمة: **Terminal** > **New Terminal**.

### 3. تثبيت الحزم (Install Dependencies):
```bash
npm install
```

### 4. تشغيل السيرفر المحلي (Start Local Server):
```bash
npm run dev
```

### 5. فتح البرنامج في المتصفح:
- افتح الرابط التالي في متصفحك:
  **`http://localhost:3000`**

---

## 🔑 بيانات الدخول الافتراضية (Default Login):
- **اسم المستخدم (Username):** `bulaale`
- **رمز المرور (Passcode):** `bulaal090`

---

## 📱 ربط الهواتف والأجهزة بالشبكة (Wi-Fi Hotspot & Multi-Device Sync):
1. قم بإنشاء نقطة اتصال (Wi-Fi Hotspot) من الحاسوب أو اربط الأجهزة بنفس شبكة المحل.
2. من شاشة الكاشير في الأعلى، اضغط على الزر الأخضر: **"Wi-Fi Hotspot / Taleefannada"**.
3. امسح رمز الـ QR بكاميرا الهاتف أو ادخل العنوان المكتوب في المتصفح.
4. أي عملية بيع أو تعديل تظهر فورياً على جميع الأجهزة بدون إنترنت.

---

## 💾 مكان حفظ البيانات (Database):
- جميع المنتجات والمبيعات والفواتير والعملاء محفوظة محلياً في:
  **`./data/pos_database.json`**
- النسخ الاحتياطية محفوظة في مجلد:
  **`./data/backups/`**
