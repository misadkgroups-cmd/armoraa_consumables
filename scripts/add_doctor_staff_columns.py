#!/usr/bin/env python3
"""Add Doctor Name and Staff Name columns to BillingLog.jsx and AllBills.jsx tables."""
import sys

# === 1. Update BillingLog.jsx ===
filepath1 = 'src/pages/BillingLog.jsx'
with open(filepath1, 'r', encoding='utf-8') as f:
    content1 = f.read()

changes1 = []

# Add Doctor and Staff columns to thead
old_thead = """                <th style={{ width: 80 }}>Bill No</th>
                <th style={{ width: 120 }}>Patient</th>
                <th style={{ width: 100 }}>UID</th>
                <th style={{ width: 100 }}>Date</th>
                <th style={{ width: 80, textAlign: 'center' }}>Services</th>
                <th style={{ width: 80, textAlign: 'center' }}>Completed</th>
                <th style={{ width: 80, textAlign: 'center' }}>Pending</th>
                <th style={{ width: 100, textAlign: 'center' }}>Status</th>
                <th style={{ width: 200, textAlign: 'center' }}>Actions</th>"""

new_thead = """                <th style={{ width: 80 }}>Bill No</th>
                <th style={{ width: 100 }}>UID</th>
                <th style={{ width: 120 }}>Patient Name</th>
                <th style={{ width: 100 }}>Service Date</th>
                <th style={{ width: 120 }}>Doctor Name</th>
                <th style={{ width: 120 }}>Staff Name</th>
                <th style={{ width: 80, textAlign: 'center' }}>Total Services</th>
                <th style={{ width: 80, textAlign: 'center' }}>Completed</th>
                <th style={{ width: 80, textAlign: 'center' }}>Pending</th>
                <th style={{ width: 100, textAlign: 'center' }}>Status</th>
                <th style={{ width: 200, textAlign: 'center' }}>Actions</th>"""

if old_thead in content1:
    content1 = content1.replace(old_thead, new_thead)
    changes1.append("BillingLog thead: DONE")
else:
    changes1.append("BillingLog thead: NOT FOUND")

# Update colSpan for loading/empty states (9 -> 11)
old_colspan = '<td colSpan="9"'
new_colspan = '<td colSpan="11"'
if old_colspan in content1:
    content1 = content1.replace(old_colspan, new_colspan)
    changes1.append("BillingLog colSpan: DONE")
else:
    changes1.append("BillingLog colSpan: NOT FOUND")

# Add Doctor and Staff cells to tbody rows
old_row = """                       <td style={{ fontWeight: 600, color: 'var(--color-primary)', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                         {bill.bill_no}
                       </td>
                       <td style={{ whiteSpace: 'nowrap', verticalAlign: 'middle' }}>{bill.patient_name || '-'}</td>
                       <td style={{ whiteSpace: 'nowrap', verticalAlign: 'middle', fontSize: 13 }}>{bill.uid || '-'}</td>
                       <td style={{ fontSize: 13 }}>{bill.service_date || '-'}</td>"""

new_row = """                       <td style={{ fontWeight: 600, color: 'var(--color-primary)', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                         {bill.bill_no}
                       </td>
                       <td style={{ whiteSpace: 'nowrap', verticalAlign: 'middle', fontSize: 13 }}>{bill.uid || '-'}</td>
                       <td style={{ whiteSpace: 'nowrap', verticalAlign: 'middle' }}>{bill.patient_name || '-'}</td>
                       <td style={{ fontSize: 13 }}>{bill.service_date || '-'}</td>
                       <td style={{ whiteSpace: 'nowrap', verticalAlign: 'middle', fontSize: 13 }}>{bill.master_doctors?.doctor_name || '-'}</td>
                       <td style={{ whiteSpace: 'nowrap', verticalAlign: 'middle', fontSize: 13 }}>{bill.master_staff?.staff_name || '-'}</td>"""

if old_row in content1:
    content1 = content1.replace(old_row, new_row)
    changes1.append("BillingLog tbody row: DONE")
else:
    changes1.append("BillingLog tbody row: NOT FOUND")

with open(filepath1, 'w', encoding='utf-8') as f:
    f.write(content1)

for c in changes1:
    print(f"BillingLog: {c}")

# === 2. Update AllBills.jsx ===
filepath2 = 'src/pages/AllBills.jsx'
with open(filepath2, 'r', encoding='utf-8') as f:
    content2 = f.read()

changes2 = []

# Add Doctor and Staff columns to thead
old_thead2 = """                <th style={{ width: 80 }}>Bill No</th>
                <th style={{ width: 120 }}>Patient</th>
                <th style={{ width: 100 }}>UID</th>
                <th style={{ width: 100 }}>Date</th>
                <th style={{ width: 80, textAlign: 'center' }}>Services</th>
                <th style={{ width: 80, textAlign: 'center' }}>Completed</th>
                <th style={{ width: 80, textAlign: 'center' }}>Pending</th>
                <th style={{ width: 100, textAlign: 'center' }}>Status</th>
                <th style={{ width: 240, textAlign: 'center' }}>Actions</th>"""

new_thead2 = """                <th style={{ width: 80 }}>Bill No</th>
                <th style={{ width: 100 }}>UID</th>
                <th style={{ width: 120 }}>Patient Name</th>
                <th style={{ width: 100 }}>Service Date</th>
                <th style={{ width: 120 }}>Doctor Name</th>
                <th style={{ width: 120 }}>Staff Name</th>
                <th style={{ width: 80, textAlign: 'center' }}>Total Services</th>
                <th style={{ width: 80, textAlign: 'center' }}>Completed</th>
                <th style={{ width: 80, textAlign: 'center' }}>Pending</th>
                <th style={{ width: 100, textAlign: 'center' }}>Status</th>
                <th style={{ width: 240, textAlign: 'center' }}>Actions</th>"""

if old_thead2 in content2:
    content2 = content2.replace(old_thead2, new_thead2)
    changes2.append("AllBills thead: DONE")
else:
    changes2.append("AllBills thead: NOT FOUND")

# Update colSpan for loading/empty states (9 -> 11)
old_colspan2 = '<td colSpan="9"'
new_colspan2 = '<td colSpan="11"'
if old_colspan2 in content2:
    content2 = content2.replace(old_colspan2, new_colspan2)
    changes2.append("AllBills colSpan: DONE")
else:
    changes2.append("AllBills colSpan: NOT FOUND")

# Add Doctor and Staff cells to tbody rows
old_row2 = """                    <td style={{ fontWeight: 600, color: 'var(--color-primary)', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                      {bill.bill_no}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', verticalAlign: 'middle' }}>{bill.patient_name || '-'}</td>
                    <td style={{ whiteSpace: 'nowrap', verticalAlign: 'middle', fontSize: 13 }}>{bill.uid || '-'}</td>
                    <td style={{ fontSize: 13 }}>{bill.service_date || '-'}</td>"""

new_row2 = """                    <td style={{ fontWeight: 600, color: 'var(--color-primary)', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                      {bill.bill_no}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', verticalAlign: 'middle', fontSize: 13 }}>{bill.uid || '-'}</td>
                    <td style={{ whiteSpace: 'nowrap', verticalAlign: 'middle' }}>{bill.patient_name || '-'}</td>
                    <td style={{ fontSize: 13 }}>{bill.service_date || '-'}</td>
                    <td style={{ whiteSpace: 'nowrap', verticalAlign: 'middle', fontSize: 13 }}>{bill.master_doctors?.doctor_name || '-'}</td>
                    <td style={{ whiteSpace: 'nowrap', verticalAlign: 'middle', fontSize: 13 }}>{bill.master_staff?.staff_name || '-'}</td>"""

if old_row2 in content2:
    content2 = content2.replace(old_row2, new_row2)
    changes2.append("AllBills tbody row: DONE")
else:
    changes2.append("AllBills tbody row: NOT FOUND")

with open(filepath2, 'w', encoding='utf-8') as f:
    f.write(content2)

for c in changes2:
    print(f"AllBills: {c}")