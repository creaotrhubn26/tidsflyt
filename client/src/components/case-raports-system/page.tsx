'use client';

import { useEffect, useState } from 'react';
import { Box, Container, Typography, Card, CardContent, Button, Grid, TextField, FormControl, InputLabel, Select, MenuItem, Chip, Alert, Dialog, DialogTitle, DialogContent, DialogActions, AlertTitle, Stack, Divider, Paper, IconButton } from '@mui/material';
import { Add, Edit, Send, Close, InfoOutlined, WarningAmber } from '@mui/icons-material';
import { CompanyProvider, useCompany } from '../../contexts/CompanyContext';
import Link from 'next/link';
import { useTranslations } from '../../contexts/TranslationsContext';
import { useSnackbar } from 'notistack';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

function CaseReportsContent() {
  const { fetchWithAuth, user } = useCompany();
  const { t } = useTranslations();
  const { enqueueSnackbar } = useSnackbar();
  const [cases, setCases] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [editingReport, setEditingReport] = useState<any>(null);
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [selectedFeedbackReport, setSelectedFeedbackReport] = useState<any>(null);
  const [formData, setFormData] = useState({
    user_cases_id: '',
    case_id: '',
    month: '',
    background: '',
    actions: '',
    progress: '',
    challenges: '',
    factors: '',
    assessment: '',
    recommendations: '',
    notes: '',
  });

  useEffect(() => {
    if (user) {
      loadCases();
      loadReports();
    }
  }, [user]);

  const loadCases = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/company/my-cases`);
      const data = await res.json();
      setCases(data.cases || []);
    } catch (error) {
      console.error('Failed to load cases:', error);
    }
  };

  const loadReports = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/case-reports`);
      const data = await res.json();
      setReports(data.reports || []);
    } catch (error) {
      console.error('Failed to load reports:', error);
    }
  };

  const handleSave = async () => {
    try {
      const method = editingReport ? 'PUT' : 'POST';
      const url = editingReport 
        ? `${API_BASE}/api/case-reports/${editingReport.id}` 
        : `${API_BASE}/api/case-reports`;
      
      await fetchWithAuth(url, {
        method,
        body: JSON.stringify(formData),
      });
      enqueueSnackbar(t('case_reports.saved', 'Rapport lagret'), { variant: 'success' });
      
      setEditingReport(null);
      setFormData({
        user_cases_id: '',
        case_id: '',
        month: '',
        background: '',
        actions: '',
        progress: '',
        challenges: '',
        factors: '',
        assessment: '',
        recommendations: '',
        notes: '',
      });
      loadReports();
    } catch (error: any) {
      console.error('Failed to save report:', error);
      enqueueSnackbar(`${t('common.save_failed', 'Feil ved lagring')}: ${error?.message || error}`, { variant: 'error' });
    }
  };

  const handleSubmit = async (reportId: number) => {
    if (!confirm(t('case_reports.submit_confirm', 'Send inn rapporten for godkjenning?'))) return;
    try {
      await fetchWithAuth(`${API_BASE}/api/case-reports/${reportId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'submitted' }),
      });
      enqueueSnackbar(t('case_reports.submitted', 'Rapport sendt inn'), { variant: 'success' });
      loadReports();
    } catch (error: any) {
      console.error('Failed to submit report:', error);
      enqueueSnackbar(`${t('case_reports.submit_failed', 'Kunne ikke sende inn')}: ${error?.message || error}`, { variant: 'error' });
    }
  };

  const startEdit = (report: any) => {
    setEditingReport(report);
    setFormData({
      user_cases_id: report.user_cases_id,
      case_id: report.case_id,
      month: report.month,
      background: report.background || '',
      actions: report.actions || '',
      progress: report.progress || '',
      challenges: report.challenges || '',
      factors: report.factors || '',
      assessment: report.assessment || '',
      recommendations: report.recommendations || '',
      notes: report.notes || '',
    });
    enqueueSnackbar(t('case_reports.edit_opened', 'Utkast åpnet for redigering'), { variant: 'info' });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'success';
      case 'submitted': return 'warning';
      case 'rejected': return 'error';
      default: return 'default';
    }
  };

  const openFeedbackDialog = (report: any) => {
    setSelectedFeedbackReport(report);
    setFeedbackDialogOpen(true);
  };

  const closeFeedbackDialog = () => {
    setFeedbackDialogOpen(false);
    setSelectedFeedbackReport(null);
  };

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleString('nb-NO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!user) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Alert severity="info">
          {t('portal.login_required_reports', 'Du må være logget inn i bedriftsportalen for å skrive saksrapporter.')} 
          <Link href="/portal/login"> {t('portal.login_here', 'Logg inn her')}</Link>
        </Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">{t('case_reports.my_reports', 'Mine saksrapporter')}</Typography>
        <Button variant="outlined" component={Link} href="/">{t('common.back', 'Tilbake')}</Button>
      </Box>

      {/* Existing Reports */}
      <Grid container spacing={2} sx={{ mb: 4 }}>
        {reports.map((report) => (
          <Grid item xs={12} md={6} key={report.id}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                  <Box>
                    <Typography variant="h6">{report.case_id}</Typography>
                    <Typography color="text.secondary" variant="body2">{report.month}</Typography>
                  </Box>
                  <Chip label={t(`case_reports.status.${report.status}`, report.status)} color={getStatusColor(report.status)} size="small" />
                </Box>
                
                {report.rejection_reason && (
                  <Alert 
                    severity="error" 
                    icon={<WarningAmber />}
                    sx={{ mt: 2, cursor: 'pointer' }}
                    onClick={() => openFeedbackDialog(report)}
                  >
                    <AlertTitle sx={{ fontWeight: 600 }}>
                      {t('case_reports.rejected_title', 'Rapporten ble avslått')}
                    </AlertTitle>
                    <Typography variant="body2" sx={{ mb: 1 }}>
                      {report.rejection_reason}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t('case_reports.rejected_by', 'Avslått av')} {report.rejected_by || 'admin'} • {formatDateTime(report.rejected_at)}
                    </Typography>
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="caption" sx={{ fontWeight: 600, color: 'error.main' }}>
                        {t('case_reports.click_details', 'Klikk for å se detaljert tilbakemelding')} →
                      </Typography>
                    </Box>
                  </Alert>
                )}
                
                <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                  {(report.status === 'draft' || report.status === 'rejected') && (
                    <>
                      <Button size="small" startIcon={<Edit />} onClick={() => startEdit(report)} variant="outlined">
                        {t('common.edit', 'Rediger')}
                      </Button>
                      <Button size="small" startIcon={<Send />} onClick={() => handleSubmit(report.id)} variant="contained" color="primary">
                        {t('common.submit', 'Send inn')}
                      </Button>
                    </>
                  )}
                  {report.rejection_reason && (
                    <Button 
                      size="small" 
                      startIcon={<InfoOutlined />} 
                      onClick={() => openFeedbackDialog(report)}
                      variant="text"
                      color="error"
                    >
                      {t('case_reports.view_feedback', 'Se tilbakemelding')}
                    </Button>
                  )}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Report Form */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            {editingReport ? t('case_reports.edit_title', 'Rediger rapport') : t('case_reports.new_title', 'Ny saksrapport')}
          </Typography>
          
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>{t('case_reports.case', 'Sak')}</InputLabel>
                <Select
                  value={formData.user_cases_id}
                  label={t('case_reports.case', 'Sak')}
                  onChange={(e) => {
                    const selectedCase = cases.find(c => c.id === e.target.value);
                    setFormData({ 
                      ...formData, 
                      user_cases_id: e.target.value, 
                      case_id: selectedCase?.case_id || '' 
                    });
                  }}
                  disabled={!!editingReport}
                >
                  {cases.map((c) => (
                    <MenuItem key={c.id} value={c.id}>{c.case_id}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                type="month"
                label={t('fields.month', 'Måned')}
                InputLabelProps={{ shrink: true }}
                value={formData.month}
                onChange={(e) => setFormData({ ...formData, month: e.target.value })}
                disabled={!!editingReport}
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={3}
                label={t('case_reports.background', 'Bakgrunn for tiltaket')}
                value={formData.background}
                onChange={(e) => setFormData({ ...formData, background: e.target.value })}
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={3}
                label={t('case_reports.actions_label', 'Arbeid og tiltak som er gjennomført')}
                value={formData.actions}
                onChange={(e) => setFormData({ ...formData, actions: e.target.value })}
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={3}
                label={t('case_reports.progress', 'Fremgang og utvikling')}
                value={formData.progress}
                onChange={(e) => setFormData({ ...formData, progress: e.target.value })}
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={3}
                label={t('case_reports.challenges', 'Utfordringer')}
                value={formData.challenges}
                onChange={(e) => setFormData({ ...formData, challenges: e.target.value })}
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={2}
                label={t('case_reports.factors', 'Faktorer som påvirker')}
                value={formData.factors}
                onChange={(e) => setFormData({ ...formData, factors: e.target.value })}
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={3}
                label={t('case_reports.assessment', 'Vurdering')}
                value={formData.assessment}
                onChange={(e) => setFormData({ ...formData, assessment: e.target.value })}
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={3}
                label={t('case_reports.recommendations', 'Anbefalinger')}
                value={formData.recommendations}
                onChange={(e) => setFormData({ ...formData, recommendations: e.target.value })}
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={2}
                label={t('fields.notes_optional', 'Notater (valgfritt)')}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </Grid>
          </Grid>
          
          <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
            <Button variant="contained" onClick={handleSave}>
              {editingReport ? t('common.update', 'Oppdater') : t('case_reports.save_draft', 'Lagre utkast')}
            </Button>
            {editingReport && (
              <Button onClick={() => {
                setEditingReport(null);
                setFormData({
                  user_cases_id: '',
                  case_id: '',
                  month: '',
                  background: '',
                  actions: '',
                  progress: '',
                  challenges: '',
                  factors: '',
                  assessment: '',
                  recommendations: '',
                  notes: '',
                });
              }}>
                {t('common.cancel', 'Avbryt')}
              </Button>
            )}
          </Box>
        </CardContent>
      </Card>

      {/* Feedback Dialog */}
      <Dialog 
        open={feedbackDialogOpen} 
        onClose={closeFeedbackDialog}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
          <Box>
            <Typography variant="h6">
              {t('case_reports.feedback_title', 'Tilbakemelding på rapport')}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {selectedFeedbackReport?.case_id} • {selectedFeedbackReport?.month}
            </Typography>
          </Box>
          <IconButton onClick={closeFeedbackDialog} size="small">
            <Close />
          </IconButton>
        </DialogTitle>
        
        <DialogContent dividers>
          {selectedFeedbackReport && (
            <Stack spacing={3}>
              {/* Status Banner */}
              <Alert severity="error" icon={<WarningAmber fontSize="large" />}>
                <AlertTitle sx={{ fontSize: '1.1rem', fontWeight: 600 }}>
                  {t('case_reports.report_rejected', 'Rapporten er avslått')}
                </AlertTitle>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  {t('case_reports.rejection_explanation', 'Din rapport har blitt gjennomgått og krever endringer før den kan godkjennes. Se detaljer nedenfor.')}
                </Typography>
              </Alert>

              {/* Rejection Details */}
              <Paper variant="outlined" sx={{ p: 2, bgcolor: 'error.50', borderColor: 'error.200' }}>
                <Typography variant="subtitle2" color="error.main" sx={{ fontWeight: 600, mb: 1 }}>
                  {t('case_reports.rejection_reason', 'Årsak til avslag')}
                </Typography>
                <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                  {selectedFeedbackReport.rejection_reason}
                </Typography>
              </Paper>

              {/* Metadata */}
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                  <strong>{t('case_reports.rejected_by', 'Avslått av')}:</strong> {selectedFeedbackReport.rejected_by || 'Administrator'}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  <strong>{t('case_reports.rejected_date', 'Dato')}:</strong> {formatDateTime(selectedFeedbackReport.rejected_at)}
                </Typography>
              </Box>

              <Divider />

              {/* Action Items */}
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>
                  {t('case_reports.next_steps', 'Neste steg')}
                </Typography>
                <Stack spacing={1.5}>
                  <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                    <Box sx={{ 
                      minWidth: 24, 
                      height: 24, 
                      borderRadius: '50%', 
                      bgcolor: 'primary.main', 
                      color: 'white', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      fontWeight: 600,
                      fontSize: '0.875rem'
                    }}>
                      1
                    </Box>
                    <Typography variant="body2">
                      {t('case_reports.step1', 'Les tilbakemeldingen nøye og noter hvilke deler som må endres')}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                    <Box sx={{ 
                      minWidth: 24, 
                      height: 24, 
                      borderRadius: '50%', 
                      bgcolor: 'primary.main', 
                      color: 'white', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      fontWeight: 600,
                      fontSize: '0.875rem'
                    }}>
                      2
                    </Box>
                    <Typography variant="body2">
                      {t('case_reports.step2', 'Klikk "Rediger" på rapporten for å gjøre endringer')}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                    <Box sx={{ 
                      minWidth: 24, 
                      height: 24, 
                      borderRadius: '50%', 
                      bgcolor: 'primary.main', 
                      color: 'white', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      fontWeight: 600,
                      fontSize: '0.875rem'
                    }}>
                      3
                    </Box>
                    <Typography variant="body2">
                      {t('case_reports.step3', 'Send inn rapporten på nytt når endringene er gjort')}
                    </Typography>
                  </Box>
                </Stack>
              </Box>

              {/* Help Section */}
              <Paper variant="outlined" sx={{ p: 2, bgcolor: 'info.50', borderColor: 'info.200' }}>
                <Stack direction="row" spacing={1.5} alignItems="flex-start">
                  <InfoOutlined color="info" />
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
                      {t('case_reports.need_help', 'Trenger du hjelp?')}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {t('case_reports.help_text', 'Hvis du er usikker på hva som må endres, ta kontakt med din kontaktperson eller administrator.')}
                    </Typography>
                  </Box>
                </Stack>
              </Paper>
            </Stack>
          )}
        </DialogContent>
        
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button onClick={closeFeedbackDialog}>
            {t('common.close', 'Lukk')}
          </Button>
          <Button 
            variant="contained" 
            startIcon={<Edit />}
            onClick={() => {
              closeFeedbackDialog();
              startEdit(selectedFeedbackReport);
            }}
          >
            {t('case_reports.edit_now', 'Rediger nå')}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}

export default function CaseReportsPage() {
  return (
    <CompanyProvider>
      <CaseReportsContent />
    </CompanyProvider>
  );
}
