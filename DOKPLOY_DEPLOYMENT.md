# نشر BHRU Prototype على VPS باستخدام Dokploy

هذا الدليل لتجهيز وتشغيل **النسخة التجريبية الحالية فقط**.
لا يضيف قاعدة بيانات أو مصادقة أو APIs حقيقية. لم يُنفَّذ GitHub push أو نشر فعلي إلى VPS.

## 1. ما الذي يعمل حاليًا؟

- الواجهة: React 19 + TypeScript + Vite 7، مع pnpm workspace.
- البناء يُنتج ملفات ثابتة في `artifacts/bhru/dist/public`.
- التشغيل: خادم ملفات ثابتة صغير يستخدم Node.js فقط، وليس Vite dev/preview.
- الخادم يستمع على `0.0.0.0` ويقرأ `PORT`، والقيمة الافتراضية `3000`.
- يدعم فتح روابط صفحات التطبيق مباشرة وتحديثها، مثل `/login` و`/admin/subscribers`.
- الصورة النهائية لا تحتوي `node_modules` أو Backend أو ملفات Replit التشغيلية.
- الصورة تعمل بحساب `node` غير root، وتتوقف بشكل منظم عند SIGTERM.

> هذه **ليست نسخة آمنة لإدارة عمل حقيقي على الإنترنت**: الدخول وSuper Admin محاكاة متاحة لمن يفتح النسخة. استخدم بيانات وهمية فقط. إن أردت حصر التجربة، احمِ الوصول من إعدادات بوابة Traefik/Dokploy أو الشبكة خارج التطبيق؛ لم نضف Authentication إلى BHRU.
>
> البيانات محفوظة في localStorage لكل متصفح ولكل origin، وليست مشتركة بين الأجهزة أو الزوار. فتح Domain جديد سيعطي بيانات تجريبية منفصلة، ولا ينقل بيانات Preview إليه. تظل البيانات القديمة في origin القديم، ما لم تمسح بيانات المتصفح.

## 2. الملفات والأوامر

نفّذ الأوامر من **جذر المستودع**:

```bash
# البناء الخاص بـBHRU فقط
pnpm --filter @workspace/bhru run build

# التشغيل بعد البناء
pnpm --filter @workspace/bhru run start
```

أمر التشغيل أعلاه يضبط `NODE_ENV=production`.
لا تستخدم أمر البناء العام للـworkspace لهذه الخطوة؛ قد يشغّل بناء API أو أدوات التصميم التي لا يحتاجها الـPrototype.

داخل صورة Docker، الأمر الفعلي هو:

```bash
node server.mjs
```

الـDockerfile يضبط `NODE_ENV=production` تلقائيًا.

### اختبار Docker يدويًا على جهاز يدعم Docker

```bash
docker build -t bhru-prototype:latest .
docker run --rm -d --name bhru-test \
  -p 127.0.0.1:3000:3000 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  bhru-prototype:latest

curl -f http://127.0.0.1:3000/healthz
curl -I http://127.0.0.1:3000/login
curl -I http://127.0.0.1:3000/admin/subscribers
docker inspect --format '{{.State.Health.Status}}' bhru-test

# افتح http://localhost:3000 في المتصفح على الجهاز نفسه
# ثم أوقف حاوية الاختبار
docker stop bhru-test
```

انتظر نحو 30 ثانية إذا كانت حالة الفحص لا تزال `starting`.
ربط `127.0.0.1` هنا للاختبار المحلي فقط؛ في Dokploy يمر الاتصال عبر Traefik.

**المعمارية المستهدفة:** Linux amd64 / x86_64، مع Debian/glibc.
إعدادات native dependencies الحالية في `pnpm-workspace.yaml` تستبعد معماريات أخرى؛ لا تستخدم Alpine أو VPS ARM لهذه الصورة كما هي.

## 3. رفع المشروع إلى GitHub لاحقًا

هذه خطوات تنفّذها أنت عند الموافقة؛ لم ينفّذها Agent:

1. أنشئ مستودعًا على GitHub، ويفضل Private.
2. ارفع المشروع من جذره كاملًا، وليس مجلد `artifacts/bhru` وحده.
3. احتفظ بملفات `pnpm-lock.yaml` و`pnpm-workspace.yaml` و`package.json` و`tsconfig.base.json`، وبمجلدي `artifacts/bhru` و`lib/api-client-react`؛ يحتاجها بناء Docker.
4. تأكد من أن Branch المستهدف هو `main`.
5. راجع الملفات قبل commit/push. لا ترفع `.env` أو مفاتيح أو Tokens أو كلمات مرور، ولا تضع Token داخل رابط Git remote.
6. لا ترفع `node_modules` أو نواتج `dist`؛ سيُعاد البناء في Docker.

يمكنك استخدام واجهة Git، أو تنفيذ هذه الأوامر بعد تجهيز المستودع وربط GitHub لديك:

```bash
git status --short
git branch -M main
# استبدل OWNER وREPOSITORY بالقيم الخاصة بك، دون إضافة Token للرابط
git remote add origin https://github.com/OWNER/REPOSITORY.git
# إذا كان origin موجودًا، لا تضفه مجددًا؛ راجع وجهته أولًا.

# أضف ملفات المشروع التي راجعتها فقط، ثم:
git commit -m "Prepare BHRU prototype for Docker"
git push -u origin main
```

`.gitignore` يستبعد ملفات الأسرار الشائعة، و`.dockerignore` يستبعدها من سياق البناء أيضًا.
لكن `.gitignore` لا يزيل ملفًا جرى تتبعه سابقًا. ملف `.npmrc` الحالي متتبّع: راجعه محليًا قبل الرفع، ولا ترفع نسخة تحمل credentials أو إعداد registry خاص. لا يحتاج Docker إلى هذا الملف.
إذا كان أي سر قد دخل تاريخ Git سابقًا، فإن تجاهل الملف لاحقًا لا يمسح التاريخ؛ احذف السر من النسخة المتتبعة وعالجه قبل مشاركة المستودع.

## 4. إعداد Application في Dokploy

يفترض هذا أن Dokploy وTraefik يعملان مسبقًا على VPS؛ هذا المشروع لا ينشئهما.

1. أنشئ Project، ثم Environment مناسبة، ثم **Application** باسم `BHRU`.
2. في Source اختر GitHub، واربط حسابك/مستودعك من واجهة Dokploy. احتفظ بأذونات GitHub داخل Dokploy، لا في Source Code.
3. اختر المستودع، وBranch: **`main`**.
4. Build Path: **`/`**، أي جذر المستودع.
5. اختر Build Type: **Dockerfile**، وليس Nixpacks أو Static.
6. اضبط:

| الحقل | القيمة |
|---|---|
| Dockerfile Path | `Dockerfile` |
| Docker Context Path | `.` |
| Docker Build Stage | اتركه فارغًا لاستخدام المرحلة الأخيرة، أو `runtime` |
| Internal / Container / Application Port | `3000` |

لا تختَر مرحلة `build` للتشغيل؛ هي مرحلة تجميع الواجهة فقط.
لا تحتاج override لأمر start أو خدمة API أو PostgreSQL أو Redis أو Docker Compose أو Volumes.
الـDockerfile يتولى تثبيت dependencies والبناء والتشغيل.
اترك Auto Deploy مغلقًا أثناء التجربة الأولى إذا أردت الموافقة يدويًا على كل نشر.

## 5. Environment Variables

في Environment الخاصة بالتطبيق استخدم:

```dotenv
NODE_ENV=production
PORT=3000
```

هاتان القيمتان موجودتان افتراضيًا في الصورة، فلا يلزم أي سر إضافي.
إذا غيّرت `PORT`، غيّر Container Port في إعداد Domain بالقيمة نفسها. `EXPOSE 3000` وصف افتراضي وليس قيدًا على قيمة `PORT`.

- `BASE_PATH=/` مضبوط **وقت البناء** داخل Dockerfile، لأن النشر المقصود عند جذر Domain.
- لا تحتاج `REPL_ID` أو `REPLIT_DOMAINS` أو `REPLIT_DEV_DOMAIN` أو `SESSION_SECRET` أو `DATABASE_URL`.
- لا تغيّر `BASE_PATH` كمتغير تشغيل متوقعًا نقل التطبيق إلى subpath؛ مسار Vite يثبت وقت البناء. هذا الإعداد مخصص لجذر Domain.
- أي أسرار مستقبلية تأتي من Environment Variables للخادم، لا من Git/Dockerfile/Frontend.
- لا تضع أسرارًا في متغيرات `VITE_*`: تُضمّن في ملفات المتصفح وتكون مرئية للزائر.
- لا تستخدم Docker `ARG` أو `ENV` لتضمين سر وقت البناء؛ استخدم Build-time Secrets عند الحاجة مستقبلًا. لا يحتاج البناء الحالي أي سر.

## 6. ربط Domain

عندما تقرر النشر بنفسك:

1. أضف سجل DNS من النوع `A` للـDomain أو Subdomain التجريبي يشير إلى IPv4 الخاص بـVPS.
2. لا تضف `AAAA` إلا إذا كان IPv6 على السيرفر مضبوطًا فعليًا.
3. في Application → Domains أضف:
   - Host: الدومين الذي تملكه، دون `https://`.
   - Path: `/`.
   - Internal Path: فارغ.
   - Strip Path: مغلق.
   - Container Port: **`3000`**.
   - HTTPS: مفعّل، Certificate: `letsencrypt`.
4. اجعل منافذ HTTP/HTTPS الخاصة بـTraefik، عادة `80` و`443`، متاحة حسب إعداد VPS الحالي.
5. بعد وصول DNS ونشر التطبيق، افتح `https://YOUR_DOMAIN`.

لا يلزم كشف `3000` مباشرة للإنترنت؛ Traefik يوجه إليه داخليًا.
لا تضف TLS داخل حاوية BHRU؛ HTTPS ينتهي عند Traefik.
ربط Domain هنا للـPrototype كله؛ ليس تنفيذًا لميزة Custom Domain الخاصة بالمشتركين.

## 7. Health check

الفحص مضمّن في Dockerfile:

- Endpoint: **`/healthz`**.
- الرد: HTTP `200` مع `{"status":"ok"}`.
- Interval: `30s`.
- Timeout: `5s`.
- Start period: `10s`.
- Retries: `3`.
- يقرأ المنفذ من `PORT`، ويستخدم Node الموجود في الصورة، فلا يحتاج curl.

يكفي إبقاء هذا الفحص. إذا احتجت ضبطه في Dokploy Advanced / Swarm Settings، استخدم نفس الأمر:

```bash
node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
```

هذا فحص لخادم الملفات وجاهزية البناء، وليس فحصًا لقاعدة بيانات أو تسجيل دخول حقيقي.

## 8. مراجعة سريعة بعد النشر الذي تنفّذه أنت

- افتح `/`، `/login`، `/register`، ثم حدّث الصفحة على `/admin/subscribers`.
- تأكد من تحميل JavaScript وCSS وعدم ظهور 404 لها.
- جرّب الأدوار والاشتراكات ببيانات وهمية في **المتصفح نفسه**؛ البيانات ليست مشتركة بين المستخدمين.
- عند HTTP 502، راجع Application logs وتطابق `PORT` مع Container Port.
- عند مشكلة DNS/HTTPS، راجع DNS وTraefik والشهادة، وليس بيانات الـPrototype.

## 9. نتيجة التحقق أثناء التجهيز

- نجح `pnpm --filter @workspace/bhru run build` للإنتاج.
- نجح TypeScript check وفحص صياغة خادم Node.
- نجح `docker build -t bhru-prototype:verify .` من سياق نظيف دون نسخ node_modules المحلي.
- اشتغلت الصورة بأمرها الافتراضي، وسجّل الخادم أنه يستمع على `0.0.0.0:3000`.
- نجحت اختبارات HTTP داخل حاوية من الصورة نفسها باستخدام `PORT=4187`: الصفحات المباشرة، JavaScript/CSS وأنواع MIME والتخزين المؤقت، و`/healthz`، وطلبات HEAD ورفض POST، و404 للملفات وAPI غير الموجودة.
- تأكد الاختبار أن التشغيل غير root وأن الصورة النهائية لا تحتوي source أو `.env` أو `.npmrc` أو node_modules، وأن assets الإنتاجية لا تتضمن حقن Vite/Replit التطويري.
- **قيد بيئة الاختبار:** `docker exec` وفحص Docker HEALTHCHECK التلقائي تعثّرا بخطأ sandbox من نوع `setns`. اختُبر الخادم داخل حاوية عبر تشغيل Node الأولي بدل exec، ونجح فحص `/healthz` يدويًا. لا يعني ذلك نجاح HEALTHCHECK التلقائي على VPS؛ تحقّق من حالته بعد نشره بنفسك هناك.
- لم يُنفّذ GitHub push أو نشر إلى VPS أو تغيير UI/UX أو منطق الـPrototype.

## المراجع

- [Dokploy: Dockerfile build settings](https://docs.dokploy.com/docs/core/applications/build-type)
- [Dokploy: Domains and Container Port](https://docs.dokploy.com/docs/core/domains)
- [Dokploy: Health checks](https://docs.dokploy.com/docs/core/applications/going-production#healthcheck--rollbacks)