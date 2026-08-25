-- إضافة عمود لرابط الموقع الفعلي (اللي بيفتح في المتصفح)
-- منفصل عن hostname اللي بيتستخدم للاتصال بـ SSH فقط.
-- في استضافات زي alwaysdata، عنوان SSH (ssh-xxx.alwaysdata.net) بيكون
-- مختلف عن رابط الموقع الحقيقي (xxx.alwaysdata.net أو دومين مخصص).

ALTER TABLE sites ADD COLUMN public_url TEXT;
