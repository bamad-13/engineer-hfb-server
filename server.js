// ============================================================
// Engineer HFB Server v2.0.0
// المطور: المهندس حمد فرج بوبكر
// ============================================================

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));

// ---------- CORS ----------
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// ---------- التوكن ----------
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'hfb_admin_2026';

// ---------- مجلد البيانات ----------
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const FILES = {
    apps:     path.join(DATA_DIR, 'apps.json'),
    images:   path.join(DATA_DIR, 'images.json'),
    articles: path.join(DATA_DIR, 'articles.json'),
    ratings:  path.join(DATA_DIR, 'ratings.json'),
    comments: path.join(DATA_DIR, 'comments.json'),
    messages: path.join(DATA_DIR, 'messages.json'),
    visits:   path.join(DATA_DIR, 'visits.json')
};

// ---------- إدارة الملفات ----------
function load(key, fallback) {
    try {
        if (fs.existsSync(FILES[key])) {
            return JSON.parse(fs.readFileSync(FILES[key], 'utf8'));
        }
    } catch (e) { console.error('قراءة فاشلة:', e.message); }
    return fallback;
}

function save(key, data) {
    try {
        fs.writeFileSync(FILES[key], JSON.stringify(data, null, 2), 'utf8');
    } catch (e) { console.error('كتابة فاشلة:', e.message); }
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

// ---------- Middleware للتحقق من Admin ----------
function requireAdmin(req, res, next) {
    const token = req.headers['x-admin-token'] || req.body.adminToken || req.query.token;
    if (!token || token !== ADMIN_TOKEN) {
        return res.status(401).json({ error: 'غير مصرح — توكن Admin غير صحيح' });
    }
    next();
}

// ============================================================
// 🏠 الرئيسية
// ============================================================
app.get('/', (req, res) => {
    res.json({
        status: '✅ Engineer HFB Server يعمل',
        version: '2.0.0',
        developer: 'المهندس حمد فرج بوبكر',
        features: ['apps', 'images', 'articles', 'ratings', 'comments', 'admin']
    });
});

// ============================================================
// 📱 التطبيقات — عرض عام
// ============================================================
app.get('/v1/apps', (req, res) => {
    const apps = load('apps', []);
    const ratings = load('ratings', []);
    const comments = load('comments', []);

    const result = apps.map(a => {
        const appRatings = ratings.filter(r => r.targetType === 'app' && r.targetId === a.id);
        const appComments = comments.filter(c => c.targetType === 'app' && c.targetId === a.id);
        const avgRating = appRatings.length > 0
            ? (appRatings.reduce((sum, r) => sum + r.value, 0) / appRatings.length).toFixed(1)
            : '0.0';

        return {
            ...a,
            avgRating: parseFloat(avgRating),
            ratingCount: appRatings.length,
            commentCount: appComments.length
        };
    });

    res.json({ apps: result, total: result.length });
});

app.get('/v1/apps/:id', (req, res) => {
    const apps = load('apps', []);
    const app_ = apps.find(a => a.id === req.params.id);
    if (!app_) return res.status(404).json({ error: 'التطبيق غير موجود' });

    const ratings = load('ratings', []).filter(r => r.targetType === 'app' && r.targetId === app_.id);
    const comments = load('comments', []).filter(c => c.targetType === 'app' && c.targetId === app_.id);
    const avgRating = ratings.length > 0
        ? (ratings.reduce((sum, r) => sum + r.value, 0) / ratings.length).toFixed(1)
        : '0.0';

    res.json({
        ...app_,
        avgRating: parseFloat(avgRating),
        ratingCount: ratings.length,
        comments: comments.sort((a, b) => new Date(b.time) - new Date(a.time))
    });
});

// ⭐ تقييم
app.post('/v1/apps/:id/rate', (req, res) => {
    const { value, userId } = req.body;
    if (!value || value < 1 || value > 5) return res.status(400).json({ error: 'التقييم من 1 إلى 5' });

    const ratings = load('ratings', []);
    const existing = ratings.findIndex(r =>
        r.targetType === 'app' && r.targetId === req.params.id && r.userId === userId
    );

    if (existing >= 0) {
        ratings[existing].value = value;
        ratings[existing].time = new Date().toISOString();
    } else {
        ratings.push({
            id: generateId(),
            targetType: 'app',
            targetId: req.params.id,
            userId: userId || 'anonymous',
            value: parseInt(value),
            time: new Date().toISOString()
        });
    }
    save('ratings', ratings);
    res.json({ success: true });
});

// 💬 تعليق
app.post('/v1/apps/:id/comment', (req, res) => {
    const { text, userName } = req.body;
    if (!text || text.trim().length < 2) return res.status(400).json({ error: 'التعليق قصير' });

    const comments = load('comments', []);
    const newComment = {
        id: generateId(),
        targetType: 'app',
        targetId: req.params.id,
        userName: userName || 'زائر',
        text: text.trim(),
        time: new Date().toISOString()
    };
    comments.push(newComment);
    save('comments', comments);
    res.json({ success: true, comment: newComment });
});

// ============================================================
// 🖼️ الصور — عرض عام
// ============================================================
app.get('/v1/images', (req, res) => {
    const images = load('images', []);
    res.json({ images, total: images.length });
});

app.get('/v1/images/:id', (req, res) => {
    const images = load('images', []);
    const img = images.find(i => i.id === req.params.id);
    if (!img) return res.status(404).json({ error: 'الصورة غير موجودة' });

    const comments = load('comments', [])
        .filter(c => c.targetType === 'image' && c.targetId === img.id)
        .sort((a, b) => new Date(b.time) - new Date(a.time));

    res.json({ ...img, comments });
});

app.post('/v1/images/:id/comment', (req, res) => {
    const { text, userName } = req.body;
    if (!text || text.trim().length < 2) return res.status(400).json({ error: 'التعليق قصير' });

    const comments = load('comments', []);
    const newComment = {
        id: generateId(),
        targetType: 'image',
        targetId: req.params.id,
        userName: userName || 'زائر',
        text: text.trim(),
        time: new Date().toISOString()
    };
    comments.push(newComment);
    save('comments', comments);
    res.json({ success: true, comment: newComment });
});

// ============================================================
// 📝 المقالات — عرض عام
// ============================================================
app.get('/v1/articles', (req, res) => {
    const articles = load('articles', []);
    res.json({ articles, total: articles.length });
});

app.get('/v1/articles/:id', (req, res) => {
    const articles = load('articles', []);
    const article = articles.find(a => a.id === req.params.id);
    if (!article) return res.status(404).json({ error: 'المقال غير موجود' });

    const comments = load('comments', [])
        .filter(c => c.targetType === 'article' && c.targetId === article.id)
        .sort((a, b) => new Date(b.time) - new Date(a.time));

    res.json({ ...article, comments });
});

app.post('/v1/articles/:id/comment', (req, res) => {
    const { text, userName } = req.body;
    if (!text || text.trim().length < 2) return res.status(400).json({ error: 'التعليق قصير' });

    const comments = load('comments', []);
    const newComment = {
        id: generateId(),
        targetType: 'article',
        targetId: req.params.id,
        userName: userName || 'زائر',
        text: text.trim(),
        time: new Date().toISOString()
    };
    comments.push(newComment);
    save('comments', comments);
    res.json({ success: true, comment: newComment });
});

// ============================================================
// ✉️ التواصل
// ============================================================
app.post('/v1/contact', (req, res) => {
    const { name, email, message } = req.body;
    if (!message || message.trim().length < 5) return res.status(400).json({ error: 'الرسالة قصيرة' });

    const messages = load('messages', []);
    messages.push({
        id: generateId(),
        name: name || 'زائر',
        email: email || '',
        message: message.trim(),
        time: new Date().toISOString(),
        read: false
    });
    save('messages', messages);
    res.json({ success: true, message: '✅ تم إرسال رسالتك' });
});

// ============================================================
// 📊 الزوار
// ============================================================
app.post('/v1/visit', (req, res) => {
    const visits = load('visits', []);
    const today = new Date().toISOString().split('T')[0];
    let todayRecord = visits.find(v => v.date === today);
    if (!todayRecord) {
        todayRecord = { date: today, count: 0 };
        visits.push(todayRecord);
    }
    todayRecord.count++;
    if (visits.length > 365) visits.splice(0, visits.length - 365);
    save('visits', visits);
    res.json({ success: true, todayCount: todayRecord.count });
});

// ============================================================
// 🛡️ ADMIN APIs — محمية
// ============================================================

// ---------- 📱 التطبيقات ----------
app.post('/v1/admin/apps', requireAdmin, (req, res) => {
    try {
        const { name, version, description, icon, apk_url } = req.body;
        if (!name) return res.status(400).json({ error: 'الاسم مطلوب' });
        if (!apk_url) return res.status(400).json({ error: 'رابط APK مطلوب' });

        const apps = load('apps', []);
        const newApp = {
            id: generateId(),
            name,
            version: version || '1.0.0',
            description: description || '',
            icon: icon || '',
            apk_url,
            time: new Date().toISOString()
        };
        apps.push(newApp);
        save('apps', apps);

        res.json({ success: true, app: newApp });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/v1/admin/apps/:id', requireAdmin, (req, res) => {
    const apps = load('apps', []);
    const filtered = apps.filter(a => a.id !== req.params.id);
    if (filtered.length === apps.length) return res.status(404).json({ error: 'غير موجود' });
    save('apps', filtered);
    res.json({ success: true });
});

// ---------- 🖼️ الصور ----------
app.post('/v1/admin/images', requireAdmin, (req, res) => {
    try {
        const { title, url, description } = req.body;
        if (!title) return res.status(400).json({ error: 'العنوان مطلوب' });
        if (!url) return res.status(400).json({ error: 'رابط الصورة مطلوب' });

        const images = load('images', []);
        const newImage = {
            id: generateId(),
            title,
            url,
            description: description || '',
            time: new Date().toISOString()
        };
        images.push(newImage);
        save('images', images);

        res.json({ success: true, image: newImage });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/v1/admin/images/:id', requireAdmin, (req, res) => {
    const images = load('images', []);
    const filtered = images.filter(i => i.id !== req.params.id);
    if (filtered.length === images.length) return res.status(404).json({ error: 'غير موجود' });
    save('images', filtered);
    res.json({ success: true });
});

// ---------- 📝 المقالات ----------
app.post('/v1/admin/articles', requireAdmin, (req, res) => {
    try {
        const { title, excerpt, content } = req.body;
        if (!title) return res.status(400).json({ error: 'العنوان مطلوب' });
        if (!content) return res.status(400).json({ error: 'المحتوى مطلوب' });

        const articles = load('articles', []);
        const newArticle = {
            id: generateId(),
            title,
            excerpt: excerpt || content.substring(0, 150),
            content,
            time: new Date().toISOString()
        };
        articles.push(newArticle);
        save('articles', articles);

        res.json({ success: true, article: newArticle });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/v1/admin/articles/:id', requireAdmin, (req, res) => {
    const articles = load('articles', []);
    const filtered = articles.filter(a => a.id !== req.params.id);
    if (filtered.length === articles.length) return res.status(404).json({ error: 'غير موجود' });
    save('articles', filtered);
    res.json({ success: true });
});

// ---------- 📊 الإحصائيات ----------
app.get('/v1/admin/stats', requireAdmin, (req, res) => {
    const apps = load('apps', []);
    const images = load('images', []);
    const articles = load('articles', []);
    const comments = load('comments', []);
    const messages = load('messages', []);
    const visits = load('visits', []);

    const today = new Date().toISOString().split('T')[0];
    const todayVisits = visits.find(v => v.date === today);

    res.json({
        apps: apps.length,
        images: images.length,
        articles: articles.length,
        comments: comments.length,
        messages: messages.length,
        todayVisitors: todayVisits ? todayVisits.count : 0,
        serverVersion: '2.0.0',
        timestamp: new Date().toISOString()
    });
});

// ---------- 💬 التعليقات (مراجعة) ----------
app.get('/v1/admin/comments', requireAdmin, (req, res) => {
    const comments = load('comments', []);
    res.json({ comments: comments.sort((a, b) => new Date(b.time) - new Date(a.time)) });
});

app.delete('/v1/admin/comments/:id', requireAdmin, (req, res) => {
    const comments = load('comments', []);
    const filtered = comments.filter(c => c.id !== req.params.id);
    save('comments', filtered);
    res.json({ success: true });
});

// ---------- ✉️ الرسائل ----------
app.get('/v1/admin/messages', requireAdmin, (req, res) => {
    const messages = load('messages', []);
    res.json({ messages: messages.sort((a, b) => new Date(b.time) - new Date(a.time)) });
});

app.delete('/v1/admin/messages/:id', requireAdmin, (req, res) => {
    const messages = load('messages', []);
    const filtered = messages.filter(m => m.id !== req.params.id);
    save('messages', filtered);
    res.json({ success: true });
});

// ============================================================
// تشغيل
// ============================================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Engineer HFB Server v2.0.0 يعمل على المنفذ ${PORT}`);
    console.log(`👨‍💻 المطور: المهندس حمد فرج بوبكر`);
    console.log(`🔐 ADMIN_TOKEN مُهيأ`);
});