// src/lib/report/pdf-renderer.tsx
// React PDF components using @react-pdf/renderer.
// These are NOT browser DOM components — they render to a PDF document.

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer';
import './pdf-fonts'; // side effect: registers NotoSansKR before any render (P0-03)
import type { ReportData, ReportSection, ReportSectionContent } from './report-types';

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  page: {
    fontFamily: 'NotoSansKR',
    fontSize: 10,
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 48,
    color: '#1a1a1a',
    backgroundColor: '#ffffff',
  },
  // Cover page
  coverPage: {
    fontFamily: 'NotoSansKR',
    fontSize: 10,
    padding: 48,
    color: '#1a1a1a',
    backgroundColor: '#ffffff',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
  },
  coverAccent: {
    width: 48,
    height: 4,
    backgroundColor: '#2563eb',
    marginBottom: 32,
  },
  coverReportType: {
    fontSize: 11,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  coverBuildingName: {
    fontSize: 26,
    fontFamily: 'NotoSansKR',
    fontWeight: 700,
    color: '#111827',
    marginBottom: 8,
  },
  coverAddress: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 32,
  },
  coverDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    marginBottom: 24,
  },
  coverMeta: {
    flexDirection: 'row',
    gap: 32,
    marginBottom: 8,
  },
  coverMetaLabel: {
    fontSize: 9,
    color: '#9ca3af',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  coverMetaValue: {
    fontSize: 10,
    color: '#374151',
  },
  fidelityBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 24,
  },
  fidelityBadgeText: {
    fontSize: 9,
    color: '#1d4ed8',
  },
  // Section page
  sectionTitle: {
    fontSize: 14,
    fontFamily: 'NotoSansKR',
    fontWeight: 700,
    color: '#111827',
    marginBottom: 4,
  },
  sectionTitleKo: {
    fontSize: 10,
    color: '#6b7280',
    marginBottom: 16,
  },
  sectionDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    marginBottom: 16,
  },
  // Key-value
  kvRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  kvLabel: {
    flex: 1,
    fontSize: 9,
    color: '#6b7280',
  },
  kvValue: {
    flex: 1,
    fontSize: 9,
    color: '#111827',
    fontFamily: 'NotoSansKR',
    fontWeight: 700,
  },
  // Table
  table: {
    marginBottom: 8,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderTopWidth: 1,
    borderTopColor: '#d1d5db',
    borderBottomWidth: 1,
    borderBottomColor: '#d1d5db',
  },
  tableHeaderCell: {
    flex: 1,
    fontSize: 8,
    fontFamily: 'NotoSansKR',
    fontWeight: 700,
    color: '#374151',
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  tableCell: {
    flex: 1,
    fontSize: 9,
    color: '#374151',
  },
  // Metric
  metricContainer: {
    padding: 16,
    backgroundColor: '#f9fafb',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    marginBottom: 8,
  },
  metricLabel: {
    fontSize: 9,
    color: '#6b7280',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 32,
    fontFamily: 'NotoSansKR',
    fontWeight: 700,
    color: '#111827',
  },
  metricUnit: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 2,
  },
  metricTrendUp: {
    fontSize: 9,
    color: '#dc2626',
    marginTop: 4,
  },
  metricTrendDown: {
    fontSize: 9,
    color: '#16a34a',
    marginTop: 4,
  },
  metricTrendNeutral: {
    fontSize: 9,
    color: '#9ca3af',
    marginTop: 4,
  },
  // Text block
  textBlock: {
    fontSize: 10,
    color: '#374151',
    lineHeight: 1.6,
    marginBottom: 8,
  },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 48,
    right: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 6,
  },
  footerDisclaimer: {
    fontSize: 7,
    color: '#9ca3af',
    flex: 1,
    marginRight: 16,
  },
  footerPage: {
    fontSize: 8,
    color: '#9ca3af',
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REPORT_TYPE_LABELS: Record<ReportData['type'], string> = {
  'energy-audit': 'Energy Audit Report / 에너지 감사 보고서',
  'compliance': 'Compliance Report / 인증 평가 보고서',
  'retrofit': 'Retrofit Report / 개선 제안 보고서',
};

const FIDELITY_LABELS: Record<1 | 2 | 3, string> = {
  1: 'Fidelity Level 1 — Public Data',
  2: 'Fidelity Level 2 — Enhanced Model',
  3: 'Fidelity Level 3 — Calibrated Model',
};

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Content renderers
// ---------------------------------------------------------------------------

function renderContent(content: ReportSectionContent): React.ReactElement {
  switch (content.type) {
    case 'text':
      return <Text style={styles.textBlock}>{content.text}</Text>;

    case 'key-value':
      return (
        <View>
          {content.items.map((item, i) => (
            <View key={i} style={styles.kvRow}>
              <Text style={styles.kvLabel}>{item.label}</Text>
              <Text style={styles.kvValue}>{item.value}</Text>
            </View>
          ))}
        </View>
      );

    case 'table':
      return (
        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            {content.headers.map((h, i) => (
              <Text key={i} style={styles.tableHeaderCell}>{h}</Text>
            ))}
          </View>
          {content.rows.map((row, ri) => (
            <View key={ri} style={styles.tableRow}>
              {row.map((cell, ci) => (
                <Text key={ci} style={styles.tableCell}>{cell}</Text>
              ))}
            </View>
          ))}
        </View>
      );

    case 'metric': {
      const trendStyle =
        content.trend === 'up' ? styles.metricTrendUp
        : content.trend === 'down' ? styles.metricTrendDown
        : styles.metricTrendNeutral;
      const trendSymbol =
        content.trend === 'up' ? '▲' : content.trend === 'down' ? '▼' : '—';
      return (
        <View style={styles.metricContainer}>
          <Text style={styles.metricLabel}>{content.label}</Text>
          <Text style={styles.metricValue}>{content.value}</Text>
          <Text style={styles.metricUnit}>{content.unit}</Text>
          {content.trend && <Text style={trendStyle}>{trendSymbol}</Text>}
        </View>
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Section page
// ---------------------------------------------------------------------------

function SectionPage({ section, data, pageNumber }: {
  section: ReportSection;
  data: ReportData;
  pageNumber: number;
}): React.ReactElement {
  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.sectionTitle}>
        <Text style={styles.sectionTitle}>{section.title}</Text>
      </View>
      <Text style={styles.sectionTitleKo}>{section.titleKo}</Text>
      <View style={styles.sectionDivider} />
      {renderContent(section.content)}
      <View style={styles.footer} fixed>
        <Text style={styles.footerDisclaimer}>{data.disclaimer}</Text>
        <Text style={styles.footerPage}>{pageNumber}</Text>
      </View>
    </Page>
  );
}

// ---------------------------------------------------------------------------
// Cover page
// ---------------------------------------------------------------------------

function CoverPage({ data }: { data: ReportData }): React.ReactElement {
  return (
    <Page size="A4" style={styles.coverPage}>
      <View style={styles.coverAccent} />
      <Text style={styles.coverReportType}>{REPORT_TYPE_LABELS[data.type]}</Text>
      <Text style={styles.coverBuildingName}>{data.buildingName}</Text>
      <Text style={styles.coverAddress}>{data.buildingAddress}</Text>
      <View style={styles.coverDivider} />
      <View style={styles.coverMeta}>
        <View>
          <Text style={styles.coverMetaLabel}>생성일</Text>
          <Text style={styles.coverMetaValue}>{formatDate(data.generatedAt)}</Text>
        </View>
        <View>
          <Text style={styles.coverMetaLabel}>섹션 수</Text>
          <Text style={styles.coverMetaValue}>{data.sections.length}개</Text>
        </View>
      </View>
      <View style={styles.fidelityBadge}>
        <Text style={styles.fidelityBadgeText}>{FIDELITY_LABELS[data.fidelityLevel]}</Text>
      </View>
    </Page>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

/**
 * Renders a ReportData object to a React PDF Document.
 * Use with @react-pdf/renderer's PDFDownloadLink or renderToStream.
 */
export function ReportPDF({ data }: { data: ReportData }): React.ReactElement {
  return (
    <Document
      title={`${data.buildingName} — ${REPORT_TYPE_LABELS[data.type]}`}
      author="BIM Digital Twin Platform"
      subject={data.buildingAddress}
      creator="BIM Digital Twin Platform"
    >
      <CoverPage data={data} />
      {data.sections.map((section, i) => (
        <SectionPage
          key={i}
          section={section}
          data={data}
          pageNumber={i + 2}
        />
      ))}
    </Document>
  );
}
