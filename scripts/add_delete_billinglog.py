#!/usr/bin/env python3
"""Add Delete button (MIS only) to BillingLog.jsx."""
import sys

filepath = 'src/pages/BillingLog.jsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

changes = []

# 1. Add misMode to useBranch destructuring
old_branch = "  const { branchId } = useBranch();"
new_branch = "  const { branchId, misMode } = useBranch();"
if old_branch in content:
    content = content.replace(old_branch, new_branch)
    changes.append("misMode: DONE")
else:
    changes.append("misMode: NOT FOUND")

# 2. Add Trash2 to lucide-react imports
old_import = "import { Eye, Pencil, FlaskConical } from 'lucide-react';"
new_import = "import { Eye, Pencil, FlaskConical, Trash2 } from 'lucide-react';"
if old_import in content:
    content = content.replace(old_import, new_import)
    changes.append("Trash2 import: DONE")
else:
    changes.append("Trash2 import: NOT FOUND")

# 3. Add Delete button after History button in actions
old_actions = """                            {/* History Button */}
                            <button 
                              onClick={() => handleViewHistory(bill)} 
                              className="btn btn-ghost btn-sm" 
                              style={{ padding: '6px 8px' }}
                              title="View History"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10"/>
                                <polyline points="12 6 12 12 16 12"/>
                              </svg>
                            </button>
                          </div>"""

new_actions = """                            {/* History Button */}
                            <button 
                              onClick={() => handleViewHistory(bill)} 
                              className="btn btn-ghost btn-sm" 
                              style={{ padding: '6px 8px' }}
                              title="View History"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10"/>
                                <polyline points="12 6 12 12 16 12"/>
                              </svg>
                            </button>

                            {/* Delete Button - MIS only */}
                            {misMode && (
                              <button
                                onClick={() => handleDeleteBill(bill)}
                                className="btn btn-sm"
                                style={{
                                  background: '#FEE2E2',
                                  color: '#991B1B',
                                  border: '1px solid #FECACA',
                                  padding: '6px 8px',
                                }}
                                title="Delete bill"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>"""

if old_actions in content:
    content = content.replace(old_actions, new_actions)
    changes.append("Delete button: DONE")
else:
    changes.append("Delete button: NOT FOUND")

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

for c in changes:
    print(c)