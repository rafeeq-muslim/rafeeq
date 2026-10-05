"""Unit titles, badge names and source credit (UI labels, not Sharia text).

Unit titles for units 2-6 are the LRN-09 table titles; en/tl are faithful translations
written for the UI. Badge names describe learning only (rules.md section 3).
"""
from build import T

CREDIT = T(
    'دروس هذه الوحدة من كتاب «المختصر المفيد للمسلم الجديد» لمحمد بن الشيبة الشهري، '
    'من الموقع الرسمي للكتاب newmuslimguideline.com.',
    'The lessons in this unit are from the book New Muslim Guideline by Muhammad al-Shehri, '
    'from the book’s official site newmuslimguideline.com.',
    'Ang mga aralin sa yunit na ito ay mula sa aklat na Patnubay Para Sa Bagong Muslim '
    'ni Muhammad Ash-Shahrīy, mula sa opisyal na website ng aklat, newmuslimguideline.com.',
)

UNITS = [
    {'id': 'u1', 'order': 1,
     'title': T('دليل اليوم الأول', 'First Day Guide', 'Gabay sa Unang Araw'),
     'badge_name': T('أكملت دليل اليوم الأول', 'Completed the First Day Guide',
                     'Natapos ang Gabay sa Unang Araw'),
     'source_credit': CREDIT},
    {'id': 'u2', 'order': 2,
     'title': T('ربي ونبيي وكتابي', 'My Lord, My Prophet and My Book',
                'Ang Aking Panginoon, Propeta at Aklat'),
     'badge_name': T('أكملت وحدة ربي ونبيي وكتابي', 'Completed My Lord, My Prophet and My Book',
                     'Natapos ang Ang Aking Panginoon, Propeta at Aklat'),
     'source_credit': CREDIT},
    {'id': 'u3', 'order': 3,
     'title': T('أركان الإسلام', 'The Pillars of Islam', 'Ang mga Haligi ng Islam'),
     'badge_name': T('أكملت وحدة أركان الإسلام', 'Completed The Pillars of Islam',
                     'Natapos ang Ang mga Haligi ng Islam'),
     'source_credit': CREDIT},
    {'id': 'u4', 'order': 4,
     'title': T('أركان الإيمان', 'The Pillars of Faith (Iman)', 'Ang mga Haligi ng Iman'),
     'badge_name': T('أكملت وحدة أركان الإيمان', 'Completed The Pillars of Faith (Iman)',
                     'Natapos ang Ang mga Haligi ng Iman'),
     'source_credit': CREDIT},
    {'id': 'u5', 'order': 5,
     'title': T('أتطهّر', 'I Purify Myself', 'Naglilinis Ako (Taharah)'),
     'badge_name': T('أكملت وحدة أتطهّر', 'Completed I Purify Myself',
                     'Natapos ang Naglilinis Ako (Taharah)'),
     'source_credit': CREDIT},
    {'id': 'u6', 'order': 6,
     'title': T('أخلاقي وسعادتي', 'My Character and My Happiness',
                'Ang Aking Pag-uugali at Kaligayahan'),
     'badge_name': T('أكملت وحدة أخلاقي وسعادتي', 'Completed My Character and My Happiness',
                     'Natapos ang Ang Aking Pag-uugali at Kaligayahan'),
     'source_credit': CREDIT},
]
