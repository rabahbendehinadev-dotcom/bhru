# BHRU — PostgreSQL وDocker/Dokploy

متطلب CMS قبل أي نشر: راجع [BHRU_PUBLIC_MEDIA.md](BHRU_PUBLIC_MEDIA.md)
لضبط volume دائم، `BHRU_MEDIA_DIR`، الصلاحيات وعلامة التأكيد والنسخ الاحتياطي.

هذه المرحلة نُفذت في **Development فقط**. لا GitHub push، لا نشر VPS، ولا تعديل Production database.
الدليل يجهّز المسار المستقبلي: GitHub `main` → Dokploy → Docker → VPS → `bhru.net`.

## ما الذي يشغله Docker الآن؟

- نفس واجهة React/Vite، مع Express API حقيقية في العملية نفسها.
- PostgreSQL خارج الحاوية، من `DATABASE_URL`؛ لا اعتماد على Replit عند تشغيل VPS.
- جلسات وحسابات وخطط واشتراكات وسجلات حقيقية مشتركة بين المتصفحات.
- خادم واحد على `0.0.0.0:PORT`؛ افتراضيًا `3000`. لا Vite dev/preview في الإنتاج.
- مسارات الواجهة المباشرة تعمل. مدخل الإدارة من `PLATFORM_ADMIN_PATH` وقت التشغيل:
  الزائر يرى صفحة Admin Login مستقلة، والمشترك العادي يحصل على `403`. المسار القديم `/admin` غير مستخدم.
- صورة متعددة المراحل، بحساب `node` غير root، دون Source أو node_modules أو credentials في الصورة النهائية.
- Linux amd64 مع Debian/glibc؛ إعداد native dependencies الحالي ليس جاهزًا لـAlpine أو ARM.

## Environment Variables

| المتغير | مطلوب | الاستخدام |
|---|---|---|
| `DATABASE_URL` | نعم | اتصال PostgreSQL الخارجية؛ يُمرَّر وقت التشغيل فقط |
| `SESSION_SECRET` | نعم | سر عشوائي بطول 32 حرفًا على الأقل لتوقيع cookie؛ يُمرَّر وقت التشغيل فقط |
| `PLATFORM_ADMIN_PATH` | نعم | URL segment خاص بمدخل الإدارة، دون `/`؛ مثال `bhru-ctrl-x7k9m2`، قيمة Runtime وليست Build Arg |
| `NODE_ENV` | نعم للإنتاج | `production`؛ موجود افتراضيًا في Dockerfile |
| `PORT` | اختياري | `3000` افتراضيًا؛ يجب أن يطابق Container Port في Dokploy |

لا أسرار أخرى مطلوبة؛ `PLATFORM_ADMIN_PATH` إعداد مسار وليس بديلًا عن الحماية. لا Clerk، Redis، SMTP، Payments أو Replit runtime credentials.
لا تضع `DATABASE_URL` أو `SESSION_SECRET` في Git أو Dockerfile أو متغيرات `VITE_*` أو Build Args.
`BASE_PATH=/` مضبوط وقت البناء للنشر عند جذر Domain؛ ليس متغير تشغيل لتغيير المسار.

أدخل القيم الحقيقية في Environment داخل Dokploy وفي Secrets داخل Development.
ولّد `SESSION_SECRET` محليًا بمولد آمن، مثل `openssl rand -hex 32`، ثم خزّنه سرًا؛ لا تشاركه في المحادثة.
تغييره يبطل cookies القديمة ويطلب تسجيل الدخول مجددًا، ولا يحذف الحسابات.

استخدم TLS وCA موثوقة إذا كانت قاعدة البيانات عبر شبكة غير موثوقة.
تُقرأ خيارات TLS من رابط PostgreSQL وفق إعداد `pg`؛ لا تعطّل التحقق من الشهادة.
لا تكشف منفذ PostgreSQL للعامة. Docker يشغّل migrations قبل التطبيق باستخدام `DATABASE_URL` نفسها؛ يجب أن يكون مستخدمها مخوّلًا بـDDL المطلوبة للمهاجرات المعتمدة.

## Build / Migration / Start

### Docker production startup

أمر الصورة الافتراضي:

```sh
node migrate.mjs && exec node index.mjs
```

عند كل تشغيل/إعادة تشغيل، ينتظر runner قفل PostgreSQL، يتجاوز الملفات المطبقة
بعد التحقق من checksums، ويطبق الملفات الجديدة بالترتيب داخل transactions.
لا يبدأ التطبيق أو health endpoint إلا بعد نجاح runner. عند الفشل تخرج الحاوية
بخطأ ولا يبدأ السيرفر. `exec` يجعل السيرفر PID 1 لاستقبال إشارات Docker/Swarm.
يشمل ذلك تلقائيًا ملفات 007 و008 وما بعدها، لأن البناء ينسخ مجلد migrations كاملًا.

اترك Command/Entrypoint override في Dokploy فارغًا لاستخدام أمر الصورة.
إذا كان هناك override قديم مثل `node index.mjs`، أزله لأنه يتجاوز بوابة migration.
لا تغيير في Environment أو media mount. فترة health startup أصبحت 120 ثانية؛
إذا كان Dokploy يفرض healthcheck/rollout timeout مستقلًا، اجعله يسمح بوقت
المهاجرة وانتظار القفل المتوقع. المهاجرات الطويلة مستقبلًا قد تحتاج مهلة أطول.
خذ نسخة احتياطية وراجع توافق المهاجرة مع النسخة القديمة التي تستمر أثناء rollout؛
قفل migrations لا يجعل تغييرات schema الهدامة متوافقة مع التطبيق القديم.

### Local/manual operation

من **جذر المستودع**، بعد `pnpm install --frozen-lockfile`:

```bash
pnpm build:bhru
pnpm db:migrate
pnpm start
```

الترتيب مهم: Build ثم migration صريحة على قاعدة البيانات المقصودة ثم Start.
الأوامر تستخدم Environment الخاصة بعملية التشغيل؛ تحقق من البيئة قبل تنفيذ migration.
البناء لا يحتاج أسرارًا ولا اتصالًا بقاعدة البيانات.
`pnpm start` يشغّل `artifacts/api-server/dist/index.mjs` مع `NODE_ENV=production`؛
لا تستخدم خادم الملفات الثابتة القديم ولا `vite preview`.

### migrations

- SQL المصدر: ملفات `lib/db/src/migrations/` بالترتيب الرقمي.
- ناتج البناء يحتوي `migrations/` و`migrate.mjs` داخل `artifacts/api-server/dist`.
- دفتر `schema_migrations` يحفظ اسم الملف وSHA-256. إعادة التشغيل تتجاوز الملف المطبق.
- advisory lock يمنع تنفيذ migration نفسها بالتوازي.
- كل ملف يُطبَّق داخل transaction؛ عند الخطأ rollback.
- لا تغيّر ملفًا مطبقًا؛ أضف ملفًا جديدًا بالرقم التالي. تغير checksum يوقف migration.
- **Docker startup يستخدم runner نفسها تلقائيًا قبل التطبيق؛ لا seed، لا reset، لا DROP DATABASE، ولا تنظيف بيانات تلقائي.**
- startup يفشل بوضوح إذا قاعدة البيانات غير متاحة أو migrations لم تُطبق.

## أول Platform Admin

1. سجّل حسابك من `/register` بكلمة مرور خاصة بك. يبدأ `PENDING` وليس Admin.
2. من بيئة موثوقة لديها اتصال قاعدة البيانات، نفّذ بعد البناء:

```bash
pnpm admin:promote -- --email your-registered-email@example.com
```

3. افتح `/<PLATFORM_ADMIN_PATH>` وسجّل الدخول بكلمة المرور نفسها؛ هذا هو المدخل الوحيد للواجهة الإدارية.
   `/login` للمشتركين فقط، ولا يعرض رابط الإدارة؛ صفحة Admin Login لا تعرض Create account.

لا كلمة مرور افتراضية، لا ترقيات تلقائية، ولا زر Admin عام. CLI تُسجّل الترقية في audit
وتبطل جلسات الحساب القديمة. لا يوجد HTTP endpoint لترقية الأدوار.
أنشئ خططك من `/<PLATFORM_ADMIN_PATH>/plans`؛ لا خطط أو أسعار وهمية مزروعة.

## إعداد Dokploy المستقبلي

لا تنفّذ النشر قبل مراجعة صاحب المشروع:

1. ارفع لاحقًا المستودع كاملًا إلى GitHub `main` بعد مراجعة الأسرار.
2. احتفظ بـDockerfile وملفات pnpm وtsconfig وبمجلدي `artifacts/bhru` و`artifacts/api-server`
   والمكتبات `lib/db` و`lib/api-zod` و`lib/api-client-react` و`scripts/prepare-production.mjs`.
3. في Dokploy: Application → Source GitHub → branch `main`.
4. Build Path `/`، Build Type `Dockerfile`، Dockerfile Path `Dockerfile`، Context `.`,
   وBuild Stage فارغ لاستخدام `runtime`.
5. اضبط `DATABASE_URL` و`SESSION_SECRET` و`PLATFORM_ADMIN_PATH` في Runtime Environment، لا أثناء البناء.
6. جهّز PostgreSQL الخارجية وخذ نسخة احتياطية قبل migrations المستقبلية.
7. لا تحتاج أمر SSH migration لكل release؛ أمر الصورة يشغّل runner قبل السيرفر.
   تأكد أن Dokploy لا يتجاوز CMD وأن `DATABASE_URL` تستهدف القاعدة الحالية المقصودة.
   migrations اليدوية تبقى متاحة للصيانة المقصودة باستخدام `node migrate.mjs`،
   لكنها ليست شرطًا إضافيًا للنشر المعتاد.

للترقية اليدوية في صورة التشغيل:

```bash
docker run --rm --env-file /secure/path/bhru-runtime.env \
  bhru:latest node admin-promote.mjs --email your-registered-email@example.com
```

راجع `.npmrc` محليًا قبل رفعه إن كان متتبّعًا؛ لا ترفع نسخة تحتوي tokens.
`.gitignore` لا يمسح أسرارًا دخلت تاريخ Git سابقًا. لا تضف أسرارًا إلى URL الخاص بـgit remote.

## Domain / HTTPS / Proxy

النشر المقصود `https://bhru.net` عند Path `/`. في Dokploy Domains:

- DNS A يشير إلى VPS؛ لا AAAA إلا إذا كان IPv6 مضبوطًا.
- Path `/`، Internal Path فارغ، Strip Path مغلق، Container Port `3000`.
- HTTPS مفعّل، شهادة Let's Encrypt، وTraefik يوجّه إلى الحاوية داخليًا.
- لا يلزم كشف منفذ `3000` أو TLS داخل حاوية Node.
- التطبيق يثق **بـreverse proxy واحدة فقط**. لا تعرض API مباشرة للعامة بطريقة تسمح بتزييف forwarded headers.
- Traefik يجب أن يحافظ على Host الأصلي ويرسل `X-Forwarded-Proto: https`.
  تُستخدم هذه القيم للتحقق من نفس origin.
- cookies: `HttpOnly` و`SameSite=Lax` و`Secure` في الإنتاج. الدخول يتطلب HTTPS؛
  اختبار الإنتاج عبر HTTP قد يعيد cookie لكن المتصفح لن يرسلها.
- mutations تحتاج `X-BHRU-Request: 1` والتحقق من Origin؛ لا permissive CORS.

هذا إعداد Domain للتطبيق كله؛ ليس custom-domain automation الخاصة بالمشتركين.

## Health / التشغيل / البيانات

- `/healthz`: HTTP 200 مع `{"status":"ok"}` عند نجاح اتصال PostgreSQL.
- Docker HEALTHCHECK كل 30 ثانية، timeout خمس ثوان، start period 120 ثانية، ثلاث محاولات.
- readiness يفشل عند تعذر PostgreSQL؛ راجع Environment والشبكة والمهاجرات عند 502.
- restart لا يعيد seed ولا يحذف حسابًا أو خطة أو جلسة.
- `ACTIVE` / `TRIAL` مع خطة ومفتاح وexpiry مستقبلية يسمحان بالـPanel.
- `PENDING` / `SUSPENDED` / `EXPIRED` / `REVOKED` تمنع الوصول من API دون حذف البيانات.
- انتهاء الصلاحية محسوب في كل request، دون الحاجة إلى cron.
- الجلسة سبعة أيام كحد مطلق. Logout يحذفها من PostgreSQL فورًا.
- Plans المعطلة لا يمكن تعيينها جديدًا؛ لا تُلغى الاشتراكات القائمة عند تعطيل الخطة.
- Approve يعطي Trial لمدة 14 يومًا على خطة متاحة. Activate يحدد الخطة والتاريخ صراحة.
- Reactivate يُبقي expiry المستقبلية، أو يعطي 30 يومًا إذا انتهت. الأسعار والخصائص من PostgreSQL.
- التغييرات من جهاز آخر تظهر عند focus أو خلال خمس ثوانٍ في التبويب المفتوح.

الأوامر التشغيلية لا تقوم بتنظيف البيانات. الجلسات المنتهية ومفاتيح rate-limit المنتهية
يمكن تنظيفها لاحقًا بصيانة محددة؛ لا Redis أو خدمة جديدة في هذه المرحلة.
راجع `BHRU_DEVELOPMENT_REPORT.md` لنتائج الاختبارات وحدود التحقق الفعلية.