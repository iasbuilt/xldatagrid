/**
 * File-upload-attach playground demo — worked example for issue #91.
 *
 * Shows how a consumer (e.g. the iasbuilt/webapp attachment system specced in
 * istracked/webapp#155) wires the grid's `upload` cell to its own backend by
 * supplying a column-level `onAttach` handler. The grid stays agnostic about
 * storage / dedupe / ACL — those concerns live in the consumer's service.
 *
 * The mock backend exposes three knobs from the page so a tester (or the
 * e2e suite in `e2e/issue-91-file-upload-attach.spec.ts`) can drive each
 * branch:
 *
 *   - "Mode = success"  : onAttach resolves after a short delay with a
 *                          synthetic AttachmentRef.
 *   - "Mode = fail"     : onAttach rejects with a controlled error; the cell
 *                          surfaces the message and exposes a Retry button.
 *   - "Latency"         : tweakable delay so the in-flight UI is observable.
 *
 * The page also logs every `onAttach` invocation and every state transition
 * to a panel on the right, so a human tester can see the contract being
 * honoured live.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DataGrid, cellRendererMap } from '@iasbuilt/datagrid-react';
import type {
  AttachmentRef,
  CellValue,
  ColumnDef,
  UploadAttachContext,
} from '@iasbuilt/datagrid-core';

// ---------------------------------------------------------------------------
// Data model
// ---------------------------------------------------------------------------

interface Row {
  id: string;
  title: string;
  attachment: CellValue;
}

const INITIAL_ROWS: Row[] = [
  { id: 'r1', title: 'Q4 financial report',    attachment: null },
  { id: 'r2', title: 'Onboarding checklist',   attachment: null },
  { id: 'r3', title: 'Architecture diagram',   attachment: null },
];

// ---------------------------------------------------------------------------
// Mock backend
// ---------------------------------------------------------------------------

type Mode = 'success' | 'fail';

interface MockBackendOptions {
  mode: Mode;
  latencyMs: number;
  failMessage: string;
}

function makeMockUpload(opts: MockBackendOptions, log: (msg: string) => void) {
  return (file: File, ctx: UploadAttachContext<Row>): Promise<AttachmentRef> => {
    log(`onAttach({ file: ${file.name}, cell: ${ctx.cell.rowId}/${ctx.cell.field}, size: ${file.size}B })`);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        if (opts.mode === 'fail') {
          log(`  -> reject(${opts.failMessage})`);
          reject(new Error(opts.failMessage));
          return;
        }
        // A real attachment service would compute a content hash, register the
        // blob, and return its id. Here we synthesise something deterministic
        // enough for testing.
        const ref: AttachmentRef = {
          id: `att_${file.name}_${file.size}`,
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          url: `https://example.invalid/attachments/${encodeURIComponent(file.name)}`,
        };
        log(`  -> resolve(${JSON.stringify(ref)})`);
        resolve(ref);
      }, opts.latencyMs);
      // (Real consumers would also wire AbortController via ctx — omitted
      //  here for brevity; the grid only requires the Promise contract.)
      void t;
    });
  };
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

function App() {
  const [rows, setRows] = useState<Row[]>(INITIAL_ROWS);
  const [mode, setMode] = useState<Mode>('success');
  const [latency, setLatency] = useState(400);
  const [log, setLog] = useState<string[]>([]);

  const appendLog = useCallback((msg: string) => {
    setLog((prev) => [...prev.slice(-49), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  const onAttach = useMemo(
    () => makeMockUpload({ mode, latencyMs: latency, failMessage: 'Mock backend rejected upload' }, appendLog),
    [mode, latency, appendLog],
  );

  const columns: ColumnDef<Row>[] = useMemo(
    () => [
      { id: 'title', field: 'title', title: 'Title', width: 240 },
      {
        id: 'attachment',
        field: 'attachment',
        title: 'Attachment',
        width: 360,
        cellType: 'upload',
        placeholder: 'Drop a file or click Upload',
        editable: true,
        // The clean #91 contract. The grid hands us the file + a CellAddress;
        // we hand back an AttachmentRef. The grid stores the ref as the cell
        // value and renders the filename as a downloadable link.
        onAttach,
        onDownload: (ref) => {
          if (typeof ref === 'string') {
            appendLog(`onDownload(string: ${ref})`);
          } else {
            appendLog(`onDownload(ref: ${ref.id})`);
          }
        },
        accept: ['.txt', '.pdf', '.png', '.jpg', '.json', 'text/*', 'image/*'],
        maxSize: 5 * 1024 * 1024,
      },
    ],
    [onAttach, appendLog],
  );

  const handleCellEdit = useCallback(
    (rowId: string, field: string, value: CellValue) => {
      setRows((prev) =>
        prev.map((r) => (r.id === rowId ? { ...r, [field]: value } : r)),
      );
    },
    [],
  );

  return (
    <div>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a' }}>
          File-upload cell — onAttach contract (#91)
        </h1>
        <p style={{ color: '#475569', marginTop: 6, fontSize: 14 }}>
          Drop a file into an <code>Attachment</code> cell or click <strong>Upload</strong>. The grid
          invokes the column's <code>onAttach</code> handler — a clean interface a webapp can wire
          to its own attachment system (e.g. istracked/webapp#155). Toggle <em>Mode</em> below to
          drive the success / failure branches; use <em>Latency</em> to make the in-flight UI
          observable.
        </p>
      </header>

      <section
        data-testid="controls"
        style={{
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          padding: 12,
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Mode
          </span>
          <select
            data-testid="mode-select"
            value={mode}
            onChange={(e) => setMode(e.target.value as Mode)}
            style={selStyle}
          >
            <option value="success">success</option>
            <option value="fail">fail</option>
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Latency&nbsp;(ms)
          </span>
          <input
            data-testid="latency-input"
            type="number"
            value={latency}
            min={0}
            step={50}
            onChange={(e) => setLatency(Number(e.target.value) || 0)}
            style={{ ...selStyle, width: 90 }}
          />
        </label>
        <button data-testid="reset-rows" onClick={() => setRows(INITIAL_ROWS)} style={btnStyle}>
          Reset rows
        </button>
        <button data-testid="clear-log" onClick={() => setLog([])} style={btnStyle}>
          Clear log
        </button>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 16, alignItems: 'start' }}>
        <div
          data-testid="grid-host"
          style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}
        >
          <DataGrid
            data={rows}
            columns={columns}
            rowKey="id"
            keyboardNavigation
            cellRenderers={cellRendererMap}
            onCellEdit={handleCellEdit}
          />
        </div>

        <aside
          data-testid="event-log"
          style={{
            background: '#0f172a',
            color: '#e2e8f0',
            borderRadius: 8,
            padding: 12,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 12,
            height: 360,
            overflow: 'auto',
          }}
        >
          <div style={{ color: '#94a3b8', marginBottom: 6 }}>onAttach event log</div>
          {log.length === 0 ? (
            <div style={{ color: '#64748b' }}>(no events yet — drop or pick a file)</div>
          ) : (
            log.map((line, i) => (
              <div key={i} style={{ whiteSpace: 'pre-wrap', marginBottom: 2 }}>
                {line}
              </div>
            ))
          )}
        </aside>
      </div>
    </div>
  );
}

const selStyle: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  fontSize: 13,
  background: '#fff',
};
const btnStyle: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  background: '#f8fafc',
  fontSize: 13,
  cursor: 'pointer',
};

createRoot(document.getElementById('root')!).render(<App />);
