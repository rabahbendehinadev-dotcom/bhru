# تقرير BHRU — الأساس الحقيقي في Development

## النطاق

تم استبدال مخزن المتصفح وsimulated login بحسابات PostgreSQL ومصادقة وجلسات وصلاحيات حقيقية.
تم الحفاظ على التصميم والـNavigation وبنية Dashboard الحالية. أزيلت نصوص Demo وأزرار الدخول الوهمي،
وأصبحت إحصاءات business غير المنفّذة فارغة/غير متاحة بدل الأرقام والصفوف المصطنعة.

**لا GitHub push، لا Deploy إلى VPS، ولا تعديل Production database.**
لم تُضف Services أو Orders أو Supplier APIs أو Payments أو Redis أو import أو infrastructure جديدة.
إعدادات Custom Domain القديمة معروضة كغير مفعّلة دون حفظ وهمي.
بيانات localStorage القديمة لا تُقرأ ولا تُستورد ولا تستخدم للهوية أو الاشتراكات.

## Database schema

| الجدول | الغرض والعلاقة |
|---|---|
| `subscribers` | كيان صاحب Server: اسم العمل، notes، تاريخ التسجيل |
| `account_users` | حساب Owner مرتبط بالمشترك، username/email فريدان ومطبّعان، بيانات الاتصال، password hash، آخر دخول |
| `platform_admin_users` | عضوية إدارة منفصلة مرتبطة بحساب حقيقي، مع enable/disable |
| `plans` | الاسم والسعر والوصف والخصائص وإتاحة التعيين محفوظة في PostgreSQL |
| `subscriptions` | اشتراك واحد لكل مشترك، plan، status، expiry، licence key، approval/activation dates |
| `activations` | سجل التفعيل/الموافقة/إعادة التفعيل مرتبط بالاشتراك والمنفّذ |
| `sessions` | SHA-256 لتوكن الجلسة، حساب المستخدم، تاريخ الإنشاء والانتهاء |
| `audit_logs` | actor وaction وtarget وtimestamp؛ أحداث التسجيل والإدارة |
| `auth_rate_limits` | throttling مستمر في PostgreSQL دون Redis؛ المفاتيح HMAC وليست IP/email صريحة |
| `schema_migrations` | اسم migration وSHA-256 وتاريخ التطبيق |

المفاتيح UUID مع foreign keys وunique constraints وفهارس الجلسات/الصلاحية/سجل العمليات.
لا بيانات seed أو خطط وأسعار hardcoded. التسجيل ينشئ subscriber وowner واشتراك `PENDING`
وسجل audit وجلسة في transaction واحدة.

## Authentication / authorization

- كلمة مرور حقيقية مطلوبة عند التسجيل والدخول؛ لا plaintext محفوظ ولا password داخل logs.
- hashing: Node `scrypt`، `N=131072`, `r=8`, `p=1`، salt عشوائي 32 bytes، مشتق 64 bytes.
- مقارنة باستخدام `timingSafeEqual`؛ الحساب غير الموجود يخضع لعملية اشتقاق مماثلة.
- حد طول كلمة المرور الجديدة 12–128 حرفًا. اشتقاق متزامن بحد أقصى عمليتين لتجنب ضغط الذاكرة.
- Login بالبريد أو username؛ رسائل رفض عامة، وrate limiting في قاعدة البيانات.
- لا أول مستخدم Admin ولا كلمة مرور افتراضية.
- الترقية يدويًا عبر CLI موثوقة فقط؛ لا endpoint عام لتغيير role.
- كل API إدارية تتحقق من عضوية Admin على السيرفر.
- كل request خاصة بمشترك تتحقق من ارتباط الحساب بالمشترك، حتى عند تزوير URL/ID.
- المشترك يرى metadata الخاصة بحسابه فقط؛ لا admin accounts أو audit logs عامة.
- Preview as subscriber متاح للمسؤول لعرض الواجهة فقط، ولا يغيّر هويته أو صلاحياته على السيرفر.

## Sessions / CSRF

- توكن عشوائي opaque من 32 bytes، cookie موقّعة HMAC-SHA-256 باستخدام `SESSION_SECRET`.
- PostgreSQL تحفظ hash التوكن فقط، وليس cookie أو التوكن الخام.
- `HttpOnly`, `SameSite=Lax`, `Secure` في production أو عند HTTPS.
- مدة مطلقة سبعة أيام. Login يدور الجلسة الحالية، Logout يحذفها فورًا، وترقية Admin تبطل جلساته السابقة.
- لا identity أو role أو licence authority من localStorage أو client parameters.
- mutations تتطلب `X-BHRU-Request: 1` وOrigin مطابقًا عند وجوده؛ cross-site fetch ممنوع، دون permissive CORS.
- الطلبات الحساسة `Cache-Control: no-store`. حد حجم JSON هو 32kb.
- الـVPS مخصص لخلف reverse proxy واحدة موثوقة وHTTPS؛ تفاصيل التشغيل في `DOKPLOY_DEPLOYMENT.md`.

## Subscription rules

- التسجيل: `PENDING`، دون الوصول الكامل للـPanel.
- Approve: خطة متاحة + `TRIAL` لمدة 14 يومًا، مع مفتاح وتاريخ تفعيل.
- Activate: خطة متاحة + expiry مستقبلية + `ACTIVE`.
- Assign Plan / Extend / Suspend / Reactivate / Revoke محفوظة transactionally مع audit.
- Edit subscriber يسمح أيضًا بتغيير expiry؛ تاريخ ماضٍ يمنع الوصول فورًا من Backend.
- `ACTIVE` و`TRIAL` يسمحان فقط بوجود خطة ومفتاح وexpiry مستقبلية.
- `PENDING`, `SUSPENDED`, `EXPIRED`, `REVOKED` تمنع الـPanel ولا تحذف بيانات.
- انتهاء الصلاحية محسوب في كل request، دون cron أو خدمة إضافية.
- Reactivate يعيد الوصول؛ يُبقي expiry المستقبلية أو يمنح 30 يومًا إذا انتهت.
- Plan disabled تمنع تعيينات جديدة، ولا تلغي licences الحالية تلقائيًا.
- تعديل من جهاز آخر يظهر عند focus أو خلال خمس ثوانٍ للتبويب الظاهر؛ API تمنع العمل المحظور فورًا.

## Environment / commands

مطلوب: `DATABASE_URL`, `SESSION_SECRET` عشوائي لا يقل عن 32 حرفًا.
للإنتاج: `NODE_ENV=production`. `PORT=3000` افتراضيًا.
لا أسرار إضافية أو أسرار frontend، ولا اعتماد VPS على Replit.

من جذر المستودع:

```bash
pnpm install --frozen-lockfile
pnpm build:bhru
pnpm db:migrate
pnpm start
```

إنشاء أول Admin بعد تسجيل حسابك:

```bash
pnpm admin:promote -- --email your-registered-email@example.com
```

ثم سجّل الدخول مجددًا بكلمة المرور الخاصة بك.

Migration source: `lib/db/src/migrations/001_platform.sql`.
الملفات المطبقة محمية بـchecksums، والتنفيذ متسلسل بـadvisory lock وtransaction لكل ملف.
إعادة migration نجحت بـ`Already applied` دون إعادة إنشاء البيانات.
startup لا ينفّذ DDL أو seed أو reset؛ يفشل بوضوح إذا DB غير متاحة أو migration مفقودة.
أزيل schema push من post-merge، وعُطّلت أوامر Drizzle push القديمة لحماية الـSQL schema؛
post-merge يثبت dependencies فقط، وتطبيق migration يبقى قرارًا صريحًا على البيئة المقصودة.

Dockerfile الحالي حُدث للبناء متعدد المراحل للواجهة والـAPI معًا؛
الصورة النهائية Node 24 غير root، وخادم Express واحد يخدم API والملفات الثابتة.
تتضمن الصورة أوامر `node migrate.mjs` و`node admin-promote.mjs --email ...`.

## نتائج التحقق المؤكدة

- TypeScript: المكتبات والـAPI وBHRU — نجحت.
- Build للواجهة والـAPI — نجح؛ توجد تحذيرات غير مانعة لحجم JavaScript وsourcemap للمكوّن القديم Tooltip.
- `docker build -t bhru-platform:verify .` — نجح من سياق نظيف مع frozen lockfile.
- Migration الأولى نجحت على Development، ثم rerun نجحت دون تغيير البيانات.
- `node scripts/test-bhru.mjs` — **28 API/database checks ناجحة**:
  anonymous protection، register/PENDING، حفظ PostgreSQL وhashing، كلمات المرور،
  تدوير الجلسات، عزل A/B، صلاحيات Admin، الترقية اليدوية، ظهور التسجيلات في جلسة مستقلة،
  إنشاء/تعديل/تعطيل الخطط، التفعيل وTRIAL، suspend/reactivate/expiry/extend/revoke،
  عدم حذف الحسابات، audit/activations، CSRF، cookie tampering، logout، التكرار، throttling.
- `node scripts/test-production-runtime.mjs` — **6 checks ناجحة**:
  تشغيل البناء مع `NODE_ENV=production` **على Development database**،
  SPA/assets، redirect الإدارة للزائر، cookie flags، `403` للمشترك، وJSON `404` للـAPI.
- Screenshot صفحة الدخول بعد حذف Demo — تعمل بالتصميم الحالي.
- اختبار الواجهة في **متصفحين مستقلين — نجح**: تسجيل Pending وترقية الإدارة، إنشاء/تعديل/إعادة تحميل الخطة،
  ظهور المشترك دون إعادة دخول المسؤول، Activate، Dashboard بعد reload، Suspend/Reactivate،
  Expire/Extend/Revoke، ورفض كلمة المرور الخاطئة ثم قبول الصحيحة مع بقاء الحظر.
  تم التحقق من headers للطلبات ومن HttpOnly/Secure، ثم تعطيل عضوية Admin والخطة المؤقتتين.
- **اختبار restart — نجح**: بعد إعادة تشغيل API بقيت أعداد البيانات كما كانت تمامًا:
  12 subscribers، 12 accounts، 12 subscriptions، خطتان، 34 audit events، خمس activations،
  وmigration واحدة. هذه حسابات تحقق فعلية وليست حسابات demo ذات كلمات مرور معروفة.

| الاختبار المطلوب | النتيجة |
|---|---|
| Register new subscriber | نجح: PENDING |
| الحفظ في PostgreSQL | نجح |
| الظهور في Platform Admin | نجح، في متصفح مستقل |
| Password صحيحة | نجح |
| Password خاطئة | رُفضت |
| منع Subscriber من الإدارة | نجح: API 403 وredirect في الواجهة |
| Admin Activate | نجح |
| Active يدخل Panel | نجح |
| Suspend يمنع الوصول | نجح |
| Reactivate يعيد الوصول | نجح |
| Expired يمنع الوصول | نجح |
| Revoked يمنع الوصول | نجح |
| Logout يبطل Session | نجح؛ replay رُفض |
| Restart لا يحذف البيانات | نجح |
| Subscriber A لا يصل إلى B | نجح، حتى مع request يدوية |

اختبارات التحقق تنشئ حسابات فعلية بأسماء واضحة `Verification` / `Runtime verification`
بكلمات مرور عشوائية غير منشورة؛ ليست seed ولا default accounts.
تُعطّل عضوية Admin المؤقتة والخطة المؤقتة بعد اختبار API؛ سجلات الاختبار محفوظة للمراجعة.
لا تُستخدم كلمات مرور الاختبار لحساب صاحب المشروع.

## حدود التحقق

لا اختبار نشر حقيقي على VPS أو `bhru.net` ولا Production DB؛ ذلك خارج التفويض.
فحص Docker exec/HEALTHCHECK داخل بيئة Replit سبق أن واجه قيود sandbox `OCI/setns`؛
نجاح البناء والتشغيل compiled خارج الحاوية لا يُعرض كدليل على healthcheck حاوية VPS.
لا password recovery أو email delivery أو إدارة staff أو business tables في هذه المرحلة.

التطبيق جاهز لمراجعة صاحب المشروع في Development؛ لا انتقال إلى مرحلة لاحقة دون موافقته.