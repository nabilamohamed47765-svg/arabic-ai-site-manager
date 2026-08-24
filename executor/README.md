# Arabic AI SSH Executor

خدمة SSH Executor خاصة بمشروع Arabic AI Site Manager.

## الوظيفة الحالية

الخدمة توفر:

- فحص حالة الخدمة.
- اختبار اتصال SSH.
- دعم أي SSH Host.
- دعم أي Username.
- دعم Password authentication.
- دعم أي Port من 1 إلى 65535.
- عدم السماح حاليًا بتنفيذ أوامر عامة.

## Endpoints

### Health

GET `/health`

### SSH Test

POST `/ssh/test`

يتطلب:

`X-SSH-Executor-Token`

## Security

بيانات SSH يتم إرسالها أثناء الطلب فقط، ولا يتم تخزينها بواسطة Executor.

تنفيذ الأوامر العامة غير مفعل في هذه المرحلة.
