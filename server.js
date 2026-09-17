// ============================================================
// Engineer HFB Server v5.0.0 — GitHub Storage
// المطور: المهندس حمد فرج بوبكر
// ============================================================

const express = require('express');

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

// ---------- الإعدادات ----------
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'hfb_admin_2026';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO || 'bamad-13/engineer-hfb-server';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';

if (!GITHUB_TOKEN) {
    console.error('❌ GITHUB_TOKEN غير موجود في متغيرات البيئة');
    process.exit(1);
}
console.log('✅ تم تهيئة GitHub Storage');
console.log(`📦 المستودع: ${GITHUB_REPO}`);
console.log(`🌿 الفرع: ${GITHUB_BRANCH}`);

// ---------- cache في الذاكرة (لتقليل طلبات GitHub) ----------
const cache = {};
const CACHE_TTL = 30 * 1000; // 30 ثانية

function getCached(key) {
    const item = cache[key];
    if (!item) return null;
    if (Date.now() - item.time > CACHE_TTL) {
        delete cache[key];
        return null;
    }
    return item.data;
}

function setCache(key, data) {
    cache[key] = { data, time: Date.now() };
}

function invalidateCache(key) {
    delete cache[key];
}

// ---------- GitHub API ----------
const GH_API = 'https://api.github.com';

async function ghGetFile(filename) {
    const url = `${GH_API}/repos/${GITHUB_REPO}/contents/${filename}?ref=${GITHUB_BRANCH}`;
    const res = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github+json',
            'User-Agent': 'EngineerHFB'
        }
    });

    if (res.status === 404) {
        // الملف غير موجود — ننشئه فارغًا
        return { content: [], sha: null };
    }

    if (!res.ok) {
        throw new Error(`GitHub API error: ${res.status}`);
    }

    const data = await res.json();
    const content = Buffer.from(data.content, 'base64').toString('utf8');
    let parsed = [];
    try {
        parsed = JSON.parse(content);
    } catch (e) {
        parsed = [];
    }
    return { content: parsed, sha: data.sha };
}

async function ghSaveFile(filename, content, sha, commitMessage) {
    const url = `${GH_API}/repos/${GITHUB_REPO}/contents/${filename}`;
    const body = {
        message: commitMessage || `Update ${filename}`,
        content: Buffer.from(JSON.stringify(content, null, 2), 'utf8').toString('base64'),
        branch: GITHUB_BRANCH
    };
    if (sha) body.sha = sha;

    const res = await fetch(url, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/json',
            'User-Agent': 'EngineerHFB'
        },
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`GitHub save failed: ${res.status} - ${err}`);
    }

    return await res.json();
}

// ---------- دوال مساعدة للتعامل مع JSON ----------
async function loadData(key) {
    const cached = getCached(key);
    if (cached) return cached;

    const file = `data/${key}.json`;
    const { content } = await ghGetFile(file);
    setCache(key, content);
    return content;
}

async function saveData(key, data, message) {
    const file = `data/${key}.json`;
    const { sha } = await ghGetFile(file);
    await ghSaveFile(file, data, sha, message || `Update ${key}`);
    invalidateCache(key);
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

// ---------- Middleware Admin ----------
function requireAdmin(req, res, next) {
    const token = req.headers['x-admin-token'] || req.body.adminToken || req.query.token;
    if (!token || token !== ADMIN_TOKEN) {
        return res.status(401).json({ error: 'غير مصرح' });
    }
    next();
}

// ============================================================
// 🏠 الرئيسية
// ============================================================
app.get('/', (req, res) => {
    res.json({
        status: '✅ Engineer HFB Server يعمل',
        version: '5.0.0',
        storage: 'GitHub',
        repo: GITHUB_REPO,
        developer: 'المهندس حمد فرج بوبكر'
    });
});

// ============================================================
// 📱 التطبيقات
// ============================================================
app.get('/v1/apps', async (req, res) => {
    try {
        const apps = await loadData('apps');
        const ratings = await loadData('ratings');
        const comments = await loadData('comments');

        const result = apps.map(a => {
            const appRatings = ratings.filter(r => r.targetType === 'app' && r.targetId === a.id);
            const appComments = comments.filter(c => c.targetType === 'app' && c.targetId === a.id);
            const avg = appRatings.length > 0
                ? (appRatings.reduce((s, r) => s + r.value, 0) / appRatings.length).toFixed(1)
                : '0.0';
            return {
                ...a,
                avgRating: parseFloat(avg),
                ratingCount: appRatings.length,
                commentCount: appComments.length
            };
        });

        res.json({ apps: result, total: result.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/v1/apps/:id', async (req, res) => {
    try {
        const apps = await loadData('apps');
        const app_ = apps.find(a => a.id === req.params.id);
        if (!app_) return res.status(404).json({ error: 'غير موجود' });

        const ratings = (await loadData('ratings')).filter(r => r.targetType === 'app' && r.targetId === app_.id);
        const comments = (await loadData('comments')).filter(c => c.targetType === 'app' && c.targetId === app_.id);

        const avg = ratings.length > 0
            ? (ratings.reduce((s, r) => s + r.value, 0) / ratings.length).toFixed(1)
            : '0.0';

        res.json({
            ...app_,
            avgRating: parseFloat(avg),
            ratingCount: ratings.length,
            comments: comments.sort((a, b) => new Date(b.time) - new Date(a.time))
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/v1/apps/:id/rate', async (req, res) => {
    try {
        const { value, userId } = req.body;
        if (!value || value < 1 || value > 5) return res.status(400).json({ error: 'التقييم من 1 إلى 5' });

        const ratings = await loadData('ratings');
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
        await saveData('ratings', ratings, `Rate app ${req.params.id}`);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/v1/apps/:id/comment', async (req, res) => {
    try {
        const { text, userName } = req.body;
        if (!text || text.trim().length < 2) return res.status(400).json({ error: 'التعليق قصير' });

        const comments = await loadData('comments');
        const newComment = {
            id: generateId(),
            targetType: 'app',
            targetId: req.params.id,
            userName: userName || 'زائر',
            text: text.trim(),
            time: new Date().toISOString()
        };
        comments.push(newComment);
        await saveData('comments', comments, `Comment on app ${req.params.id}`);
        res.json({ success: true, comment: newComment });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// 🖼️ الصور
// ============================================================
app.get('/v1/images', async (req, res) => {
    try {
        const images = await loadData('images');
        res.json({ images, total: images.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/v1/images/:id', async (req, res) => {
    try {
        const images = await loadData('images');
        const img = images.find(i => i.id === req.params.id);
        if (!img) return res.status(404).json({ error: 'غير موجود' });

        const comments = (await loadData('comments'))
            .filter(c => c.targetType === 'image' && c.targetId === img.id)
            .sort((a, b) => new Date(b.time) - new Date(a.time));

        res.json({ ...img, comments });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/v1/images/:id/comment', async (req, res) => {
    try {
        const { text, userName } = req.body;
        if (!text || text.trim().length < 2) return res.status(400).json({ error: 'التعليق قصير' });

        const comments = await loadData('comments');
        const newComment = {
            id: generateId(),
            targetType: 'image',
            targetId: req.params.id,
            userName: userName || 'زائر',
            text: text.trim(),
            time: new Date().toISOString()
        };
        comments.push(newComment);
        await saveData('comments', comments, `Comment on image ${req.params.id}`);
        res.json({ success: true, comment: newComment });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// 📝 المقالات
// ============================================================
app.get('/v1/articles', async (req, res) => {
    try {
        const articles = await loadData('articles');
        res.json({ articles, total: articles.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/v1/articles/:id', async (req, res) => {
    try {
        const articles = await loadData('articles');
        const article = articles.find(a => a.id === req.params.id);
        if (!article) return res.status(404).json({ error: 'غير موجود' });

        const comments = (await loadData('comments'))
            .filter(c => c.targetType === 'article' && c.targetId === article.id)
            .sort((a, b) => new Date(b.time) - new Date(a.time));

        res.json({ ...article, comments });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/v1/articles/:id/comment', async (req, res) => {
    try {
        const { text, userName } = req.body;
        if (!text || text.trim().length < 2) return res.status(400).json({ error: 'التعليق قصير' });

        const comments = await loadData('comments');
        const newComment = {
            id: generateId(),
            targetType: 'article',
            targetId: req.params.id,
            userName: userName || 'زائر',
            text: text.trim(),
            time: new Date().toISOString()
        };
        comments.push(newComment);
        await saveData('comments', comments, `Comment on article ${req.params.id}`);
        res.json({ success: true, comment: newComment });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// ✉️ التواصل
// ============================================================
app.post('/v1/contact', async (req, res) => {
    try {
        const { name, email, message } = req.body;
        if (!message || message.trim().length < 5) return res.status(400).json({ error: 'الرسالة قصيرة' });

        const messages = await loadData('messages');
        messages.push({
            id: generateId(),
            name: name || 'زائر',
            email: email || '',
            message: message.trim(),
            time: new Date().toISOString(),
            read: false
        });
        await saveData('messages', messages, 'New contact message');
        res.json({ success: true, message: '✅ تم إرسال رسالتك' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// 📊 الزوار
// ============================================================
app.post('/v1/visit', async (req, res) => {
    try {
        const visits = await loadData('visits');
        const today = new Date().toISOString().split('T')[0];
        let todayRecord = visits.find(v => v.date === today);
        if (!todayRecord) {
            todayRecord = { date: today, count: 0 };
            visits.push(todayRecord);
        }
        todayRecord.count++;

        if (visits.length > 365) visits.splice(0, visits.length - 365);

        // نحفظ بشكل غير متزامن (لا ننتظر)
        saveData('visits', visits, `Visit ${today}`).catch(e => console.error('visit save error:', e.message));

        res.json({ success: true, todayCount: todayRecord.count });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// ============================================================
// 🛡️ ADMIN APIs
// ============================================================
app.post('/v1/admin/apps', requireAdmin, async (req, res) => {
    try {
        const { name, version, description, icon, apk_url } = req.body;
        if (!name) return res.status(400).json({ error: 'الاسم مطلوب' });
        if (!apk_url) return res.status(400).json({ error: 'رابط APK مطلوب' });

        const apps = await loadData('apps');
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
        await saveData('apps', apps, `Add app: ${name}`);
        res.json({ success: true, app: newApp });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/v1/admin/apps/:id', requireAdmin, async (req, res) => {
    try {
        let apps = await loadData('apps');
        const filtered = apps.filter(a => a.id !== req.params.id);
        if (filtered.length === apps.length) return res.status(404).json({ error: 'غير موجود' });
        await saveData('apps', filtered, `Delete app ${req.params.id}`);

        // حذف التعليقات والتقييمات المرتبطة
        let comments = await loadData('comments');
        comments = comments.filter(c => !(c.targetType === 'app' && c.targetId === req.params.id));
        await saveData('comments', comments, `Cleanup comments for app ${req.params.id}`);

        let ratings = await loadData('ratings');
        ratings = ratings.filter(r => !(r.targetType === 'app' && r.targetId === req.params.id));
        await saveData('ratings', ratings, `Cleanup ratings for app ${req.params.id}`);

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/v1/admin/images', requireAdmin, async (req, res) => {
    try {
        const { title, url, description } = req.body;
        if (!title) return res.status(400).json({ error: 'العنوان مطلوب' });
        if (!url) return res.status(400).json({ error: 'الرابط مطلوب' });

        const images = await loadData('images');
        const newImage = {
            id: generateId(),
            title,
            url,
            description: description || '',
            time: new Date().toISOString()
        };
        images.push(newImage);
        await saveData('images', images, `Add image: ${title}`);
        res.json({ success: true, image: newImage });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/v1/admin/images/:id', requireAdmin, async (req, res) => {
    try {
        let images = await loadData('images');
        const filtered = images.filter(i => i.id !== req.params.id);
        if (filtered.length === images.length) return res.status(404).json({ error: 'غير موجود' });
        await saveData('images', filtered, `Delete image ${req.params.id}`);

        let comments = await loadData('comments');
        comments = comments.filter(c => !(c.targetType === 'image' && c.targetId === req.params.id));
        await saveData('comments', comments, `Cleanup comments for image ${req.params.id}`);

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/v1/admin/articles', requireAdmin, async (req, res) => {
    try {
        const { title, excerpt, content } = req.body;
        if (!title) return res.status(400).json({ error: 'العنوان مطلوب' });
        if (!content) return res.status(400).json({ error: 'المحتوى مطلوب' });

        const articles = await loadData('articles');
        const newArticle = {
            id: generateId(),
            title,
            excerpt: excerpt || content.substring(0, 150),
            content,
            time: new Date().toISOString()
        };
        articles.push(newArticle);
        await saveData('articles', articles, `Add article: ${title}`);
        res.json({ success: true, article: newArticle });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/v1/admin/articles/:id', requireAdmin, async (req, res) => {
    try {
        let articles = await loadData('articles');
        const filtered = articles.filter(a => a.id !== req.params.id);
        if (filtered.length === articles.length) return res.status(404).json({ error: 'غير موجود' });
        await saveData('articles', filtered, `Delete article ${req.params.id}`);

        let comments = await loadData('comments');
        comments = comments.filter(c => !(c.targetType === 'article' && c.targetId === req.params.id));
        await saveData('comments', comments, `Cleanup comments for article ${req.params.id}`);

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/v1/admin/stats', requireAdmin, async (req, res) => {
    try {
        const apps = await loadData('apps');
        const images = await loadData('images');
        const articles = await loadData('articles');
        const comments = await loadData('comments');
        const messages = await loadData('messages');
        const visits = await loadData('visits');

        const today = new Date().toISOString().split('T')[0];
        const todayVisit = visits.find(v => v.date === today);

        res.json({
            apps: apps.length,
            images: images.length,
            articles: articles.length,
            comments: comments.length,
            messages: messages.length,
            todayVisitors: todayVisit ? todayVisit.count : 0,
            serverVersion: '5.0.0',
            storage: 'GitHub',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/v1/admin/comments', requireAdmin, async (req, res) => {
    try {
        const comments = await loadData('comments');
        res.json({ comments: comments.sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 200) });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/v1/admin/comments/:id', requireAdmin, async (req, res) => {
    try {
        let comments = await loadData('comments');
        comments = comments.filter(c => c.id !== req.params.id);
        await saveData('comments', comments, `Delete comment ${req.params.id}`);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/v1/admin/messages', requireAdmin, async (req, res) => {
    try {
        const messages = await loadData('messages');
        res.json({ messages: messages.sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 200) });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/v1/admin/messages/:id', requireAdmin, async (req, res) => {
    try {
        let messages = await loadData('messages');
        messages = messages.filter(m => m.id !== req.params.id);
        await saveData('messages', messages, `Delete message ${req.params.id}`);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// تشغيل
// ============================================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Engineer HFB Server v5.0.0 يعمل على المنفذ ${PORT}`);
    console.log(`📦 Storage: GitHub (${GITHUB_REPO})`);
    console.log(`👨‍💻 المطور: المهندس حمد فرج بوبكر`);
});