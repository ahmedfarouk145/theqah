# دليل ربط المشروع مع GitHub

## 🔗 حالة المشروع الحالية

- ✅ المشروع مربوط بـ GitHub: `https://github.com/ahmedfarouk145/theqah`
- ⚠️ هناك مشكلة في الصلاحيات (Permission denied)
- ✅ الكود جاهز للرفع (committed محلياً)

---

## 📋 خطوات الربط والرفع

### الطريقة 1: استخدام SSH (موصى به)

#### 1. إنشاء SSH Key (إذا لم يكن موجود)

```bash
# تحقق من وجود SSH key
ls ~/.ssh/id_rsa.pub

# إذا لم يكن موجود، أنشئ واحد جديد
ssh-keygen -t ed25519 -C "your_email@example.com"
# اضغط Enter لكل الأسئلة (أو غير اسم الملف إذا أردت)
```

#### 2. إضافة SSH Key إلى GitHub

```bash
# اعرض المفتاح العام
cat ~/.ssh/id_rsa.pub

# أو على Windows
type %USERPROFILE%\.ssh\id_rsa.pub

# انسخ المحتوى الكامل
# ثم:
# 1. اذهب إلى https://github.com/settings/keys
# 2. اضغط "New SSH key"
# 3. الصق المفتاح وأعطيه عنوان
# 4. احفظ
```

#### 3. تغيير Remote URL إلى SSH

```bash
# تحقق من الـ remote الحالي
git remote -v

# غيّر الـ URL إلى SSH
git remote set-url origin git@github.com:ahmedfarouk145/theqah.git

# تحقق مرة أخرى
git remote -v
```

#### 4. رفع الكود

```bash
git push origin master
```

---

### الطريقة 2: استخدام Personal Access Token (PAT)

#### 1. إنشاء Personal Access Token

1. اذهب إلى: https://github.com/settings/tokens
2. اضغط "Generate new token" → "Generate new token (classic)"
3. أعطه اسم: `theqah-project`
4. اختر الصلاحيات:
   - ✅ `repo` (كلها)
5. اضغط "Generate token"
6. **انسخ الرمز فوراً** (لن تظهر مرة أخرى!)

#### 2. تغيير Remote URL لاستخدام Token

```bash
# غيّر الـ URL ليشمل الـ token
git remote set-url origin https://YOUR_TOKEN@github.com/ahmedfarouk145/theqah.git

# استبدل YOUR_TOKEN بالرمز الذي نسخته
```

#### 3. رفع الكود

```bash
git push origin master
```

**ملاحظة:** الرمز سيُحفظ في الـ URL (غير آمن تماماً)

---

### الطريقة 3: استخدام GitHub CLI (gh)

#### 1. تثبيت GitHub CLI

```bash
# على Windows (باستخدام winget)
winget install GitHub.cli

# أو على Mac
brew install gh

# أو على Linux
sudo apt install gh
```

#### 2. تسجيل الدخول

```bash
gh auth login

# اختر:
# - GitHub.com
# - HTTPS
# - Login with a web browser
# - اتبع التعليمات
```

#### 3. رفع الكود

```bash
git push origin master
```

---

### الطريقة 4: إصلاح المشكلة الحالية (Windows Credential Manager)

إذا كنت على Windows ويوجد مشكلة في الـ credentials:

```bash
# 1. احذف الـ credentials القديمة
git credential-manager-core erase
# أو
git credential reject https://github.com

# 2. حاول الرفع مرة أخرى (سيطلب منك تسجيل الدخول)
git push origin master
```

---

## ✅ بعد الرفع الناجح

### التحقق من الرفع

```bash
# تحقق من الحالة
git status

# يجب أن ترى:
# "Your branch is up to date with 'origin/master'"

# أو شاهد على GitHub:
# https://github.com/ahmedfarouk145/theqah
```

---

## 🔄 الأوامر الأساسية للعمل المستقبلي

### 1. إضافة ملفات جديدة/محدثة

```bash
# إضافة ملفات محددة
git add src/file.ts

# إضافة جميع الملفات
git add .

# إضافة ملفات محددة بنمط
git add src/**/*.ts
```

### 2. عمل Commit

```bash
# مع رسالة
git commit -m "وصف التغييرات"

# مثال:
git commit -m "Update subscription plans"
```

### 3. رفع الكود

```bash
# رفع الـ branch الحالي
git push origin master

# أو إذا كان اسم الـ branch مختلف
git push origin BRANCH_NAME
```

### 4. سحب التحديثات

```bash
# سحب آخر التحديثات من GitHub
git pull origin master

# أو
git fetch origin
git merge origin/master
```

---

## 📝 Best Practices

### 1. Commit Messages واضحة

```bash
# ✅ جيد
git commit -m "Fix subscription plan limits"
git commit -m "Add Vision API to moderation"

# ❌ سيء
git commit -m "fix"
git commit -m "update"
```

### 2. Commit قبل Push دائماً

```bash
# دائماً:
# 1. git add .
# 2. git commit -m "message"
# 3. git push
```

### 3. Pull قبل Push (إذا كان هناك آخرون يعملون)

```bash
# 1. git pull origin master
# 2. حل أي تعارضات (conflicts)
# 3. git add .
# 4. git commit -m "message"
# 5. git push origin master
```

---

## 🛠️ حل المشاكل الشائعة

### 1. Permission Denied

```bash
# استخدم SSH أو PAT (انظر الطرق أعلاه)
```

### 2. Authentication Failed

```bash
# احذف الـ credentials القديمة
git credential reject https://github.com

# حاول مرة أخرى
git push origin master
```

### 3. Branch Diverged

```bash
# سحب التحديثات أولاً
git pull origin master

# حل التعارضات إن وجدت
# ثم ارفع مرة أخرى
git push origin master
```

### 4. Large Files

```bash
# استخدم Git LFS للملفات الكبيرة
git lfs install
git lfs track "*.largefile"
git add .gitattributes
```

---

## 📚 روابط مفيدة

- GitHub Repository: https://github.com/ahmedfarouk145/theqah
- SSH Keys: https://github.com/settings/keys
- Personal Access Tokens: https://github.com/settings/tokens
- GitHub CLI: https://cli.github.com/

---

## 🎯 الخطوات السريعة للرفع الآن

**إذا كنت تستخدم SSH:**
```bash
git remote set-url origin git@github.com:ahmedfarouk145/theqah.git
git push origin master
```

**إذا كنت تستخدم PAT:**
```bash
# 1. أنشئ token من https://github.com/settings/tokens
# 2. ثم:
git remote set-url origin https://YOUR_TOKEN@github.com/ahmedfarouk145/theqah.git
git push origin master
```

**إذا كنت تستخدم GitHub CLI:**
```bash
gh auth login
git push origin master
```

---

## ✅ الخلاصة

المشروع مربوط بـ GitHub، والكود جاهز للرفع. اختر إحدى الطرق أعلاه وأرفع الكود!

**الطريقة الموصى بها:** SSH (أكثر أماناً وسرعة)

