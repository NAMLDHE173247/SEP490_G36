const fs = require('fs');
let c = fs.readFileSync('frontend_v2/src/pages/DataPrepView.tsx', 'utf8');

const regex = /\{\/\* Checkbox: Lọc từ khóa l[\s\S]*?\{\(\(\) => \{/;

const replacement = `                        {/* Checkbox: Lọc từ khóa lỗi */}
                        <label className="cleaning-checkbox">
                          <input
                            type="checkbox"
                            checked={removeErrorKeywords}
                            onChange={() => setRemoveErrorKeywords(!removeErrorKeywords)}
                          />
                          <span className="checkbox-mark"></span>
                          <span className="checkbox-label">Lọc từ khóa lỗi (ví dụ: "I am an AI", "As a language model",...)</span>
                        </label>
                      </div>
                    )}

                    {cleaningEnabled && (
                      <div className="cleaning-inputs-row" style={{ marginTop: '16px', display: 'flex', gap: '16px' }}>
                        <div className="cleaning-input-group">
                          <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>Min Chars</label>
                          <input type="number" value={minChars} onChange={(e) => setMinChars(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', width: '100px' }} />
                        </div>
                        <div className="cleaning-input-group">
                          <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>Max Chars</label>
                          <input type="number" value={maxChars} onChange={(e) => setMaxChars(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', width: '100px' }} />
                        </div>
                        <div className="cleaning-input-group">
                          <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>Min Pairs</label>
                          <input type="number" value={minPairs} onChange={(e) => setMinPairs(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', width: '100px' }} />
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="cluster-popup-footer" style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="cluster-run-btn" onClick={handleRunCleaning} disabled={isCleaningLoading} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: '#3b82f6', color: '#fff', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>
                      {isCleaningLoading ? <RefreshCw size={18} className="animate-spin" /> : <Sparkles size={18} />}
                      {isCleaningLoading ? 'Đang phân tích...' : 'Run Cleaning Pipeline'}
                    </button>
                  </div>
                </div>
              )}

              {/* ===== VIEW: Preview ===== */}
              {cleaningPopupView === 'preview' && (
                <div className="cluster-popup-body" style={{ padding: '0', display: 'flex', flexDirection: 'column' }}>
                  {(() => {`;

if (regex.test(c)) {
  c = c.replace(regex, replacement);
  fs.writeFileSync('frontend_v2/src/pages/DataPrepView.tsx', c);
  console.log("Replaced successfully!");
} else {
  console.log("Regex not found!");
}
