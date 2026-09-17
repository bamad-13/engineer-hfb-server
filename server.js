// ============================================================
// Engineer HFB Server v1.0.0
// موقع المطور حمد فرج بوبكر
// ============================================================

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));

// ---------- CORS (السماح للموقع بالوصول) ----------
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// ---------- مجلد البيانات ----------
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------- ملفات البيانات ----------
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

// ============================================================
// 🏠 الرئيسية
// ============================================================
app.get('/', (req, res) => {
    res.json({
        status: '✅ Engineer HFB Server يعمل',
        version: '1.0.0',
        developer: 'المهندس حمد فرج بوبكر',
        endpoints: {
            apps: '/v1/apps',
            images: '/v1/images',
            articles: '/v1/articles',
            contact: '/v1/contact',
            visit: '/v1/visit'
        }
    });
});

// ============================================================
// 📱 التطبيقات
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
    if (!value || value < 1 || value > 5) return res.status(400).json({ error: 'التقييم يجب أن يكون من 1 إلى 5' });

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
    if (!text || text.trim().length < 2) return res.status(400).json({ error: 'التعليق قصير جدًا' });

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
// 🖼️ الصور
// ============================================================
app.get('/v1/images', (req, res) => {
    const images = load('images', []);
    res.json({ images, total: images.length });
});

app.post('/v1/images/:id/rate', (req, res) => {
    const { value, userId } = req.body;
    if (!value || value < 1 || value > 5) return res.status(400).json({ error: 'التقييم يجب أن يكون من 1 إلى 5' });

    const ratings = load('ratings', []);
    const existing = ratings.findIndex(r =>
        r.targetType === 'image' && r.targetId === req.params.id && r.userId === userId
    );

    if (existing >= 0) {
        ratings[existing].value = value;
        ratings[existing].time = new Date().toISOString();
    } else {
        ratings.push({
            id: generateId(),
            targetType: 'image',
            targetId: req.params.id,
            userId: userId || 'anonymous',
            value: parseInt(value),
            time: new Date().toISOString()
        });
    }
    save('ratings', ratings);
    res.json({ success: true });
});

app.post('/v1/images/:id/comment', (req, res) => {
    const { text, userName } = req.body;
    if (!text || text.trim().length < 2) return res.status(400).json({ error: 'التعليق قصير جدًا' });

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
// 📝 المقالات
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
    if (!text || text.trim().length < 2) return res.status(400).json({ error: 'التعليق قصير جدًا' });

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
    if (!message || message.trim().length < 5) return res.status(400).json({ error: 'الرسالة قصيرة جدًا' });

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
    res.json({ success: true, message: '✅ تم إرسال رسالتك، شكرًا!' });
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
// تشغيل
// ============================================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Engineer HFB Server يعمل على المنفذ ${PORT}`);
    console.log(`👨‍💻 المطور: المهندس حمد فرج بوبكر`);
});