// اختبار مطابقة الكلمات — شغّله بـ: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalize, findRule } = require('../lib/rules');

test('توحيد الكتابة العربية', () => {
  assert.equal(normalize('أسعار'), 'اسعار');
  assert.equal(normalize('إعلان'), 'اعلان');
  assert.equal(normalize('آخر'), 'اخر');
  assert.equal(normalize('مدرسة'), 'مدرسه');
  assert.equal(normalize('مستشفى'), 'مستشفي');
  assert.equal(normalize('سِعْرُ'), 'سعر');
  assert.equal(normalize('ســـعر'), 'سعر');
  assert.equal(normalize('  PRICE   please '), 'price please');
});

const rules = [
  { id: 'a', keywords: ['سعر', 'الأسعار', 'price'], match: 'contains', on: 'both', reply: 'r1' },
  { id: 'b', keywords: ['تم'], match: 'exact', on: 'comment', reply: 'r2' },
  { id: 'c', keywords: ['درون'], match: 'contains', on: 'dm', reply: 'r3' },
  { id: 'd', keywords: ['عرس'], match: 'contains', on: 'both', reply: 'r4', enabled: false },
];

test('الرسالة فيها الكلمة', () => {
  assert.equal(findRule(rules, 'شو سعر التصوير؟', 'dm')?.id, 'a');
  assert.equal(findRule(rules, 'بدي الاسعار لو سمحت', 'comment')?.id, 'a');
  assert.equal(findRule(rules, 'What is the PRICE', 'dm')?.id, 'a');
});

test('المطابقة بالضبط', () => {
  assert.equal(findRule(rules, 'تم', 'comment')?.id, 'b');
  assert.equal(findRule(rules, ' تم ', 'comment')?.id, 'b');
  assert.equal(findRule(rules, 'تمام', 'comment'), null);
});

test('وين يشتغل الرد', () => {
  assert.equal(findRule(rules, 'تم', 'dm'), null);
  assert.equal(findRule(rules, 'بدي تصوير درون', 'dm')?.id, 'c');
  assert.equal(findRule(rules, 'بدي تصوير درون', 'comment'), null);
});

test('الرد الموقّف ما بيشتغل، والرسالة الفاضية ما بتطابق', () => {
  assert.equal(findRule(rules, 'تصوير عرس', 'dm'), null);
  assert.equal(findRule(rules, '', 'dm'), null);
  assert.equal(findRule(rules, '   ', 'dm'), null);
  assert.equal(findRule([], 'سعر', 'dm'), null);
});
