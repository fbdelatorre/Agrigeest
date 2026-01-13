import React, { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { supabase } from '../lib/supabase';
import Card from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import Select from '../components/ui/Select';
import Badge from '../components/ui/Badge';
import {
  Globe,
  User,
  Save,
  Mail,
  Phone,
  Building2,
  Calendar,
  Plus,
  Check,
  X,
  Users,
  Link,
  Copy,
  Trash2,
  Database,
  Wifi,
  RefreshCw
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { formatDateForDisplay } from '../utils/dateHelpers';

interface Profile {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: string;
  institution: string;
  institutionId: string;
  isAdmin: boolean;
}

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isAdmin: boolean;
}

interface Invitation {
  code: string;
  createdAt: string;
  expiresAt: string;
  createdByName: string;
  usedAt: string | null;
  usedByName: string | null;
}

interface Season {
  id: string;
  name: string;
  start_date: string;
  end_date: string | null;
  status: 'active' | 'completed' | 'planned';
  description: string | null;
}

export default function Settings() {
  const { language, setLanguage } = useLanguage();
  const { isOnline, hasPendingSync, syncData, products = [] } = useAppContext();
  const { connectionType, connectionSpeed } = useNetworkStatus();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loadingToggle, setLoadingToggle] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedProfile, setEditedProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [creatingInvitation, setCreatingInvitation] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [cacheSize, setCacheSize] = useState<string | null>(null);
  
  // Season form state
  const [showSeasonForm, setShowSeasonForm] = useState(false);
  const [seasonFormData, setSeasonFormData] = useState({
    name: '',
    start_date: '',
    end_date: '',
    description: '',
    status: 'planned' as 'active' | 'completed' | 'planned'
  });
  const [seasonErrors, setSeasonErrors] = useState<{ [key: string]: string }>({});
  const [seasonLoading, setSeasonLoading] = useState(false);
  const [seasonMessage, setSeasonMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load profile data
  useEffect(() => {
    loadProfile();
  }, []);

  // Load users and invitations when profile is available
  useEffect(() => {
    if (profile?.institutionId && isOnline) {
      loadUsers();
      loadInvitations();
      loadSeasons();
    }
  }, [profile?.institutionId, isOnline]);

  // Calcula o tamanho aproximado do cache
  useEffect(() => {
    const calculateCacheSize = async () => {
      if ('caches' in window) {
        try {
          const cacheNames = await caches.keys();
          let totalSize = 0;
          
          for (const cacheName of cacheNames) {
            const cache = await caches.open(cacheName);
            const keys = await cache.keys();
            
            // Estimativa aproximada (não é possível obter o tamanho exato)
            for (const request of keys) {
              const response = await cache.match(request);
              if (response) {
                const blob = await response.blob();
                totalSize += blob.size;
              }
            }
          }
          
          // Converte para KB ou MB
          if (totalSize > 1024 * 1024) {
            setCacheSize(`${(totalSize / (1024 * 1024)).toFixed(2)} MB`);
          } else {
            setCacheSize(`${(totalSize / 1024).toFixed(2)} KB`);
          }
        } catch (error) {
          console.error('Erro ao calcular tamanho do cache:', error);
          setCacheSize(null);
        }
      }
    };
    
    calculateCacheSize();
  }, []);

  const loadProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profileData, error } = await supabase
        .from('user_profiles')
        .select('id, first_name, last_name, phone, role, institution, institution_id, is_admin')
        .eq('id', user.id)
        .single();

      if (error) throw error;

      setProfile({
        id: profileData.id,
        firstName: profileData.first_name,
        lastName: profileData.last_name,
        phone: profileData.phone,
        role: profileData.role,
        institution: profileData.institution,
        institutionId: profileData.institution_id,
        isAdmin: profileData.is_admin
      });

      setEditedProfile({
        id: profileData.id,
        firstName: profileData.first_name,
        lastName: profileData.last_name,
        phone: profileData.phone,
        role: profileData.role,
        institution: profileData.institution,
        institutionId: profileData.institution_id,
        isAdmin: profileData.is_admin
      });
    } catch (error) {
      console.error('Error loading profile:', error);
    }
  };

  const loadUsers = async () => {
    try {
      if (!profile?.institutionId) {
        console.warn('Institution ID is missing, cannot load users.');
        return;
      }

      const { data, error } = await supabase
        .rpc('list_institution_users', {
          institution_id_param: profile.institutionId
        });

      if (error) throw error;

      setUsers(data.map(user => ({
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        isAdmin: user.is_admin
      })));
    } catch (error) {
      console.error('Error loading users:', error);
    }
  };

  const loadInvitations = async () => {
    try {
      if (!profile?.institutionId || !profile.isAdmin) return;

      const { data, error } = await supabase
        .rpc('list_active_invitations', {
          institution_id_param: profile.institutionId
        });

      if (error) throw error;

      setInvitations(data.map(inv => ({
        code: inv.code,
        createdAt: inv.created_at,
        expiresAt: inv.expires_at,
        createdByName: inv.created_by_name,
        usedAt: inv.used_at,
        usedByName: inv.used_by_name
      })));
    } catch (error) {
      console.error('Error loading invitations:', error);
    }
  };

  const loadSeasons = async () => {
    try {
      if (!profile?.institutionId) return;

      const { data, error } = await supabase
        .from('seasons')
        .select('*')
        .eq('institution_id', profile.institutionId)
        .order('start_date', { ascending: false });

      if (error) throw error;

      setSeasons(data || []);
    } catch (error) {
      console.error('Error loading seasons:', error);
    }
  };

  const handleToggleAdmin = async (userId: string, newStatus: boolean) => {
    try {
      setLoadingToggle(userId);

      const { error } = await supabase
        .rpc('toggle_user_admin_status', {
          user_id_param: userId,
          new_status: newStatus
        });

      if (error) throw error;

      setUsers(prev => prev.map(user => 
        user.id === userId 
          ? { ...user, isAdmin: newStatus }
          : user
      ));
    } catch (error) {
      console.error('Error toggling admin status:', error);
      alert(language === 'pt'
        ? 'Erro ao alterar status de administrador'
        : 'Error changing administrator status');
    } finally {
      setLoadingToggle(null);
    }
  };

  const handleCreateInvitation = async () => {
    try {
      setCreatingInvitation(true);

      const { data, error } = await supabase
        .rpc('create_invitation', {
          p_institution_id: profile?.institutionId,
        });

      if (error) throw error;

      // Reload invitations to show the new one
      await loadInvitations();
    } catch (error) {
      console.error('Error creating invitation:', error);
      alert(language === 'pt'
        ? 'Erro ao criar convite'
        : 'Error creating invitation');
    } finally {
      setCreatingInvitation(false);
    }
  };

  const handleDeleteInvitation = async (code: string) => {
    try {
      const { data, error } = await supabase
        .rpc('delete_invitation', {
          invitation_code: code
        });

      if (error) throw error;

      if (data) {
        // Reload invitations list
        await loadInvitations();
        
        // Show success message
        setMessage({
          type: 'success',
          text: language === 'pt' 
            ? 'Convite excluído com sucesso!'
            : 'Invitation deleted successfully!'
        });
      }
    } catch (error) {
      console.error('Error deleting invitation:', error);
      setMessage({
        type: 'error',
        text: language === 'pt'
          ? 'Erro ao excluir convite'
          : 'Error deleting invitation'
      });
    }
  };

  const handleCopyInviteCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      alert(language === 'pt'
        ? 'Código copiado para a área de transferência!'
        : 'Code copied to clipboard!');
    } catch (error) {
      console.error('Error copying code:', error);
      alert(language === 'pt'
        ? 'Erro ao copiar código'
        : 'Error copying code');
    }
  };

  const handleUpdateProfile = async () => {
    if (!editedProfile) return;

    try {
      setLoading(true);
      setMessage(null);

      const { error } = await supabase
        .from('user_profiles')
        .update({
          first_name: editedProfile.firstName,
          last_name: editedProfile.lastName,
          phone: editedProfile.phone,
          role: editedProfile.role
        })
        .eq('id', editedProfile.id);

      if (error) throw error;

      setProfile(editedProfile);
      setIsEditing(false);
      setMessage({
        type: 'success',
        text: language === 'pt' ? 'Perfil atualizado com sucesso!' : 'Profile updated successfully!'
      });
    } catch (error) {
      console.error('Error updating profile:', error);
      setMessage({
        type: 'error',
        text: language === 'pt' ? 'Erro ao atualizar perfil' : 'Error updating profile'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSeasonChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setSeasonFormData(prev => ({ ...prev, [name]: value }));
    
    // Clear error for the field being edited
    if (seasonErrors[name]) {
      setSeasonErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const validateSeasonForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};
    
    if (!seasonFormData.name.trim()) {
      newErrors.name = language === 'pt' ? 'Nome é obrigatório' : 'Name is required';
    }
    
    if (!seasonFormData.start_date) {
      newErrors.start_date = language === 'pt' ? 'Data inicial é obrigatória' : 'Start date is required';
    }
    
    setSeasonErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleCreateSeason = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateSeasonForm()) return;
    
    try {
      setSeasonLoading(true);
      setSeasonMessage(null);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');
      
      const { data, error } = await supabase
        .from('seasons')
        .insert([{
          name: seasonFormData.name,
          start_date: seasonFormData.start_date,
          end_date: seasonFormData.end_date || null,
          status: seasonFormData.status,
          description: seasonFormData.description || null,
          user_id: user.id,
          institution_id: profile?.institutionId
        }])
        .select()
        .single();
      
      if (error) throw error;
      
      // Reset form
      setSeasonFormData({
        name: '',
        start_date: '',
        end_date: '',
        description: '',
        status: 'planned'
      });
      
      // Hide form
      setShowSeasonForm(false);
      
      // Show success message
      setSeasonMessage({
        type: 'success',
        text: language === 'pt' 
          ? 'Safra criada com sucesso!'
          : 'Season created successfully!'
      });
      
      // Reload seasons
      await loadSeasons();
    } catch (error) {
      console.error('Error creating season:', error);
      setSeasonMessage({
        type: 'error',
        text: language === 'pt'
          ? 'Erro ao criar safra'
          : 'Error creating season'
      });
    } finally {
      setSeasonLoading(false);
    }
  };

  const handleUpdateSeasonStatus = async (seasonId: string, newStatus: 'active' | 'completed' | 'planned') => {
    try {
      setLoadingToggle(seasonId);
      
      const { error } = await supabase
        .rpc('update_season_status', {
          season_id_param: seasonId,
          new_status: newStatus
        });
      
      if (error) throw error;
      
      // Reload seasons
      await loadSeasons();
    } catch (error) {
      console.error('Error updating season status:', error);
      alert(language === 'pt'
        ? 'Erro ao atualizar status da safra'
        : 'Error updating season status');
    } finally {
      setLoadingToggle(null);
    }
  };

  const handleDeleteSeason = async (seasonId: string) => {
    if (!confirm(language === 'pt'
      ? 'Tem certeza que deseja excluir esta safra? Esta ação não pode ser desfeita.'
      : 'Are you sure you want to delete this season? This action cannot be undone.'
    )) return;
    
    try {
      setLoadingToggle(seasonId);
      
      const { error } = await supabase
        .from('seasons')
        .delete()
        .eq('id', seasonId);
      
      if (error) throw error;
      
      // Reload seasons
      await loadSeasons();
      
      // Show success message
      setSeasonMessage({
        type: 'success',
        text: language === 'pt'
          ? 'Safra excluída com sucesso!'
          : 'Season deleted successfully!'
      });
    } catch (error) {
      console.error('Error deleting season:', error);
      setSeasonMessage({
        type: 'error',
        text: language === 'pt'
          ? 'Erro ao excluir safra'
          : 'Error deleting season'
      });
    } finally {
      setLoadingToggle(null);
    }
  };

  const handleClearCache = async () => {
    if (!confirm(language === 'pt'
      ? 'Tem certeza que deseja limpar o cache? Isso removerá todos os dados armazenados localmente.'
      : 'Are you sure you want to clear the cache? This will remove all locally stored data.'
    )) return;
    
    try {
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
        
        setCacheSize('0 KB');
        
        setMessage({
          type: 'success',
          text: language === 'pt'
            ? 'Cache limpo com sucesso!'
            : 'Cache cleared successfully!'
        });
      }
    } catch (error) {
      console.error('Erro ao limpar cache:', error);
      setMessage({
        type: 'error',
        text: language === 'pt'
          ? 'Erro ao limpar cache'
          : 'Error clearing cache'
      });
    }
  };

  const handleSyncData = async () => {
    if (!isOnline) {
      setMessage({
        type: 'error',
        text: language === 'pt'
          ? 'Não é possível sincronizar dados offline'
          : 'Cannot sync data while offline'
      });
      return;
    }
    
    try {
      setSyncLoading(true);
      await syncData();
      
      setMessage({
        type: 'success',
        text: language === 'pt'
          ? 'Dados sincronizados com sucesso!'
          : 'Data synced successfully!'
      });
    } catch (error) {
      console.error('Erro ao sincronizar dados:', error);
      setMessage({
        type: 'error',
        text: language === 'pt'
          ? 'Erro ao sincronizar dados'
          : 'Error syncing data'
      });
    } finally {
      setSyncLoading(false);
    }
  };

  const formatDate = (date: string | Date) => {
    return formatDateForDisplay(date, language === 'pt' ? 'pt-BR' : 'en-US');
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string, variant: 'primary' | 'success' | 'warning' | 'default' }> = {
      active: {
        label: language === 'pt' ? 'Ativa' : 'Active',
        variant: 'success'
      },
      completed: {
        label: language === 'pt' ? 'Concluída' : 'Completed',
        variant: 'default'
      },
      planned: {
        label: language === 'pt' ? 'Planejada' : 'Planned',
        variant: 'warning'
      }
    };
    
    const { label, variant } = statusMap[status] || { label: status, variant: 'default' };
    
    return <Badge variant={variant}>{label}</Badge>;
  };

  return (
    <div className="space-y-6 pt-4 lg:pt-0">
      <h1 className="text-2xl font-bold text-gray-900">
        {language === 'pt' ? 'Configurações' : 'Settings'}
      </h1>

      {/* Language Settings */}
      <Card>
        <Card.Header>
          <Card.Title className="flex items-center">
            <Globe className="w-5 h-5 mr-2" />
            {language === 'pt' ? 'Idioma' : 'Language'}
          </Card.Title>
        </Card.Header>
        <Card.Content>
          <div className="max-w-xs">
            <Select
              label={language === 'pt' ? 'Idioma' : 'Language'}
              value={language}
              onChange={(e) => setLanguage(e.target.value as 'en' | 'pt')}
              options={[
                { value: 'en', label: 'English' },
                { value: 'pt', label: 'Português' },
              ]}
            />
          </div>
        </Card.Content>
      </Card>

      {/* User Profile */}
      <Card>
        <Card.Header>
          <Card.Title className="flex items-center">
            <User className="w-5 h-5 mr-2" />
            {language === 'pt' ? 'Perfil do Usuário' : 'User Profile'}
          </Card.Title>
        </Card.Header>
        <Card.Content>
          {message && (
            <div className={`mb-4 p-3 rounded-lg text-sm ${
              message.type === 'success'
                ? 'bg-green-50 text-green-600 border border-green-200'
                : 'bg-red-50 text-red-600 border border-red-200'
            }`}>
              {message.text}
            </div>
          )}

          {!isEditing ? (
            <div className="space-y-4">
              <div className="flex items-center p-4 bg-gray-50 rounded-lg">
                <User className="w-12 h-12 text-gray-400" />
                <div className="ml-4">
                  <h3 className="font-medium text-gray-900">
                    {profile?.firstName} {profile?.lastName}
                  </h3>
                  <p className="text-sm text-gray-500">{profile?.role}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center text-gray-600">
                  <Mail className="w-4 h-4 mr-2" />
                  <span className="text-sm font-medium">Email:</span>
                  <span className="ml-2">{profile?.email}</span>
                </div>
                
                <div className="flex items-center text-gray-600">
                  <Phone className="w-4 h-4 mr-2" />
                  <span className="text-sm font-medium">
                    {language === 'pt' ? 'Telefone:' : 'Phone:'}
                  </span>
                  <span className="ml-2">{profile?.phone || '-'}</span>
                </div>
                
                <div className="flex items-center text-gray-600">
                  <User className="w-4 h-4 mr-2" />
                  <span className="text-sm font-medium">
                    {language === 'pt' ? 'Cargo:' : 'Role:'}
                  </span>
                  <span className="ml-2">{profile?.role || '-'}</span>
                </div>
                
                <div className="flex items-center text-gray-600">
                  <Building2 className="w-4 h-4 mr-2" />
                  <span className="text-sm font-medium">
                    {language === 'pt' ? 'Instituição:' : 'Institution:'}
                  </span>
                  <span className="ml-2">{profile?.institution || '-'}</span>
                </div>
              </div>

              <div className="mt-6">
                <Button
                  onClick={() => setIsEditing(true)}
                  variant="secondary"
                >
                  {language === 'pt' ? 'Editar Perfil' : 'Edit Profile'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label={language === 'pt' ? 'Nome' : 'First Name'}
                  value={editedProfile?.firstName}
                  onChange={(e) => setEditedProfile(prev => ({ ...prev!, firstName: e.target.value }))}
                  placeholder={language === 'pt' ? 'Seu nome' : 'Your first name'}
                  required
                />

                <Input
                  label={language === 'pt' ? 'Sobrenome' : 'Last Name'}
                  value={editedProfile?.lastName}
                  onChange={(e) => setEditedProfile(prev => ({ ...prev!, lastName: e.target.value }))}
                  placeholder={language === 'pt' ? 'Seu sobrenome' : 'Your last name'}
                  required
                />
              </div>

              <Input
                type="tel"
                label={language === 'pt' ? 'Telefone' : 'Phone'}
                value={editedProfile?.phone}
                onChange={(e) => setEditedProfile(prev => ({ ...prev!, phone: e.target.value }))}
                placeholder={language === 'pt' ? '(00) 00000-0000' : '(000) 000-0000'}
              />

              <Input
                label={language === 'pt' ? 'Cargo' : 'Role'}
                value={editedProfile?.role}
                onChange={(e) => setEditedProfile(prev => ({ ...prev!, role: e.target.value }))}
                placeholder={language === 'pt' ? 'Seu cargo na instituição' : 'Your role in the institution'}
                required
              />

              <div className="flex gap-3">
                <Button
                  onClick={handleUpdateProfile}
                  disabled={loading}
                  leftIcon={<Save size={18} />}
                >
                  {loading 
                    ? (language === 'pt' ? 'Salvando...' : 'Saving...')
                    : (language === 'pt' ? 'Salvar Alterações' : 'Save Changes')}
                </Button>

                <Button
                  variant="outline"
                  onClick={() => {
                    setIsEditing(false);
                    setEditedProfile(profile);
                    setMessage(null);
                  }}
                  leftIcon={<X size={18} />}
                >
                  {language === 'pt' ? 'Cancelar' : 'Cancel'}
                </Button>
              </div>
            </div>
          )}
        </Card.Content>
      </Card>

      {/* Offline & Sync Settings */}
      <Card>
        <Card.Header>
          <Card.Title className="flex items-center">
            <Wifi className="w-5 h-5 mr-2" />
            {language === 'pt' ? 'Dados Offline e Sincronização' : 'Offline Data & Sync'}
          </Card.Title>
        </Card.Header>
        <Card.Content>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-sm font-medium text-gray-700">
                  {language === 'pt' ? 'Status da Conexão' : 'Connection Status'}
                </h3>
                <p className="text-sm text-gray-600">
                  {isOnline 
                    ? (language === 'pt' ? 'Conectado' : 'Connected') 
                    : (language === 'pt' ? 'Desconectado' : 'Disconnected')}
                  {connectionType && ` (${connectionType})`}
                  {connectionSpeed && ` - ${connectionSpeed}`}
                </p>
              </div>
              <Badge variant={isOnline ? 'success' : 'danger'}>
                {isOnline 
                  ? (language === 'pt' ? 'Online' : 'Online')
                  : (language === 'pt' ? 'Offline' : 'Offline')}
              </Badge>
            </div>

            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-sm font-medium text-gray-700">
                  {language === 'pt' ? 'Dados Pendentes' : 'Pending Data'}
                </h3>
                <p className="text-sm text-gray-600">
                  {hasPendingSync
                    ? (language === 'pt' ? 'Existem dados para sincronizar' : 'There is data to sync')
                    : (language === 'pt' ? 'Todos os dados estão sincronizados' : 'All data is synced')}
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<RefreshCw size={16} />}
                onClick={handleSyncData}
                disabled={!isOnline || !hasPendingSync || syncLoading}
              >
                {syncLoading
                  ? (language === 'pt' ? 'Sincronizando...' : 'Syncing...')
                  : (language === 'pt' ? 'Sincronizar Agora' : 'Sync Now')}
              </Button>
            </div>

            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-sm font-medium text-gray-700">
                  {language === 'pt' ? 'Cache do Aplicativo' : 'App Cache'}
                </h3>
                <p className="text-sm text-gray-600">
                  {cacheSize 
                    ? (language === 'pt' ? `Tamanho atual: ${cacheSize}` : `Current size: ${cacheSize}`)
                    : (language === 'pt' ? 'Tamanho desconhecido' : 'Unknown size')}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 border-red-200 hover:bg-red-50"
                onClick={handleClearCache}
              >
                {language === 'pt' ? 'Limpar Cache' : 'Clear Cache'}
              </Button>
            </div>

            <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <h3 className="text-sm font-medium text-amber-800 mb-1">
                {language === 'pt' ? 'Sobre o Modo Offline' : 'About Offline Mode'}
              </h3>
              <p className="text-xs text-amber-700">
                {language === 'pt'
                  ? 'Quando você está offline, o aplicativo armazena suas alterações localmente. Ao ficar online novamente, os dados serão sincronizados automaticamente com o servidor.'
                  : 'When you are offline, the app stores your changes locally. When you go online again, the data will be automatically synced with the server.'}
              </p>
            </div>
          </div>
        </Card.Content>
      </Card>

      {/* Database Information */}
      <Card>
        <Card.Header>
          <Card.Title className="flex items-center">
            <Database className="w-5 h-5 mr-2" />
            {language === 'pt' ? 'Informações do Banco de Dados' : 'Database Information'}
          </Card.Title>
        </Card.Header>
        <Card.Content>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="text-sm font-medium text-gray-700 mb-1">
                  {language === 'pt' ? 'Produtos' : 'Products'}
                </h3>
                <p className="text-2xl font-bold text-gray-900">{products.length}</p>
              </div>
            </div>
            
            <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <h3 className="text-sm font-medium text-gray-700 mb-2">
                {language === 'pt' ? 'Sobre os Dados' : 'About the Data'}
              </h3>
              <p className="text-sm text-gray-600">
                {language === 'pt'
                  ? 'Todos os dados são armazenados no Supabase e sincronizados com o seu dispositivo para acesso offline. Alterações feitas offline serão sincronizadas quando você estiver online novamente.'
                  : 'All data is stored in Supabase and synced with your device for offline access. Changes made offline will be synced when you are online again.'}
              </p>
            </div>
          </div>
        </Card.Content>
      </Card>

      {/* Seasons Management */}
      <Card>
        <Card.Header>
          <div className="flex justify-between items-center">
            <Card.Title className="flex items-center">
              <Calendar className="w-5 h-5 mr-2" />
              {language === 'pt' ? 'Gerenciamento de Safras' : 'Season Management'}
            </Card.Title>
            <Button
              onClick={() => setShowSeasonForm(true)}
              leftIcon={<Plus size={18} />}
              disabled={showSeasonForm}
            >
              {language === 'pt' ? 'Nova Safra' : 'New Season'}
            </Button>
          </div>
        </Card.Header>
        <Card.Content>
          {seasonMessage && (
            <div className={`mb-4 p-3 rounded-lg text-sm ${
              seasonMessage.type === 'success'
                ? 'bg-green-50 text-green-600 border border-green-200'
                : 'bg-red-50 text-red-600 border border-red-200'
            }`}>
              {seasonMessage.text}
            </div>
          )}

          {showSeasonForm && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <h3 className="text-lg font-medium mb-4">
                {language === 'pt' ? 'Nova Safra' : 'New Season'}
              </h3>
              <form onSubmit={handleCreateSeason} className="space-y-4">
                <Input
                  name="name"
                  label={language === 'pt' ? 'Nome da Safra' : 'Season Name'}
                  value={seasonFormData.name}
                  onChange={handleSeasonChange}
                  placeholder={language === 'pt' ? 'ex: Safra 2025/2026' : 'e.g., Season 2025/2026'}
                  error={seasonErrors.name}
                  required
                />
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    name="start_date"
                    label={language === 'pt' ? 'Data Inicial' : 'Start Date'}
                    type="date"
                    value={seasonFormData.start_date}
                    onChange={handleSeasonChange}
                    error={seasonErrors.start_date}
                    required
                  />
                  
                  <Input
                    name="end_date"
                    label={language === 'pt' ? 'Data Final (opcional)' : 'End Date (optional)'}
                    type="date"
                    value={seasonFormData.end_date}
                    onChange={handleSeasonChange}
                    helperText={language === 'pt' 
                      ? 'Deixe em branco se a safra ainda estiver em andamento'
                      : 'Leave blank if the season is still ongoing'}
                  />
                </div>
                
                <Select
                  name="status"
                  label={language === 'pt' ? 'Status' : 'Status'}
                  value={seasonFormData.status}
                  onChange={handleSeasonChange}
                  options={[
                    { value: 'planned', label: language === 'pt' ? 'Planejada' : 'Planned' },
                    { value: 'active', label: language === 'pt' ? 'Ativa' : 'Active' },
                    { value: 'completed', label: language === 'pt' ? 'Concluída' : 'Completed' }
                  ]}
                />
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {language === 'pt' ? 'Descrição (opcional)' : 'Description (optional)'}
                  </label>
                  <textarea
                    name="description"
                    value={seasonFormData.description}
                    onChange={handleSeasonChange}
                    rows={3}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    placeholder={language === 'pt' 
                      ? 'Digite detalhes adicionais sobre esta safra...'
                      : 'Enter any additional details about this season...'}
                  />
                </div>
                
                <div className="flex justify-end space-x-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowSeasonForm(false);
                      setSeasonFormData({
                        name: '',
                        start_date: '',
                        end_date: '',
                        description: '',
                        status: 'planned'
                      });
                      setSeasonErrors({});
                    }}
                  >
                    {language === 'pt' ? 'Cancelar' : 'Cancel'}
                  </Button>
                  
                  <Button
                    type="submit"
                    disabled={seasonLoading}
                  >
                    {seasonLoading
                      ? (language === 'pt' ? 'Criando...' : 'Creating...')
                      : (language === 'pt' ? 'Criar Safra' : 'Create Season')}
                  </Button>
                </div>
              </form>
            </div>
          )}

          <div className="space-y-4">
            {seasons.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                        {language === 'pt' ? 'Nome' : 'Name'}
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                        {language === 'pt' ? 'Período' : 'Period'}
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                        {language === 'pt' ? 'Status' : 'Status'}
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                        {language === 'pt' ? 'Descrição' : 'Description'}
                      </th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">
                        {language === 'pt' ? 'Ações' : 'Actions'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {seasons.map((season) => (
                      <tr key={season.id} className="hover:bg-gray-50">
                        <td className="px-4 py-4">
                          <div className="font-medium text-gray-900">{season.name}</div>
                        </td>
                        <td className="px-4 py-4 text-gray-500">
                
                          {new Date(season.start_date).toLocaleDateString(language === 'pt' ? 'pt-BR' : 'en-US')}
                          {season.end_date && (
                            <> - {new Date(season.end_date).toLocaleDateString(language === 'pt' ? 'pt-BR' : 'en-US')}</>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          {getStatusBadge(season.status)}
                        </td>
                        <td className="px-4 py-4 text-gray-500">
                          {season.description || (language === 'pt' ? 'Sem descrição' : 'No description')}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <div className="flex justify-end space-x-2">
                            {season.status !== 'active' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleUpdateSeasonStatus(season.id, 'active')}
                                disabled={loadingToggle === season.id}
                                className="text-green-600 border-green-200 hover:bg-green-50"
                              >
                                {language === 'pt' ? 'Ativar' : 'Activate'}
                              </Button>
                            )}
                            
                            {season.status === 'active' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleUpdateSeasonStatus(season.id, 'completed')}
                                disabled={loadingToggle === season.id}
                              >
                                {language === 'pt' ? 'Concluir' : 'Complete'}
                              </Button>
                            )}
                            
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteSeason(season.id)}
                              disabled={loadingToggle === season.id}
                              className="text-red-600 border-red-200 hover:bg-red-50"
                            >
                              {language === 'pt' ? 'Excluir' : 'Delete'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>
                  {language === 'pt'
                    ? 'Nenhuma safra cadastrada'
                    : 'No seasons registered'}
                </p>
                <Button
                  variant="ghost"
                  className="mt-2"
                  onClick={() => setShowSeasonForm(true)}
                >
                  {language === 'pt' ? 'Criar Primeira Safra' : 'Create First Season'}
                </Button>
              </div>
            )}
          </div>
        </Card.Content>
      </Card>

      {/* Institution Users */}
      {profile?.isAdmin && (
        <>
          <Card>
            <Card.Header>
              <Card.Title className="flex items-center">
                <Users className="w-5 h-5 mr-2" />
                {language === 'pt' ? 'Usuários da Instituição' : 'Institution Users'}
              </Card.Title>
            </Card.Header>
            <Card.Content>
              <div className="space-y-4">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                          {language === 'pt' ? 'Nome' : 'Name'}
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                          Email
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                          {language === 'pt' ? 'Cargo' : 'Role'}
                        </th>
                        <th className="px-4 py-3 text-center text-sm font-medium text-gray-500">
                          {language === 'pt' ? 'Administrador' : 'Administrator'}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {users.map((user) => (
                        <tr key={user.id} className="hover:bg-gray-50">
                          <td className="px-4 py-4">
                            <div className="font-medium text-gray-900">
                              {user.firstName} {user.lastName}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-gray-500">
                            {user.email}
                          </td>
                          <td className="px-4 py-4 text-gray-500">
                            {user.role}
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex justify-center">
                              <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={user.isAdmin}
                                  onChange={() => handleToggleAdmin(user.id, !user.isAdmin)}
                                  disabled={user.id === profile.id || loadingToggle === user.id}
                                  className="sr-only peer"
                                />
                                <div className={`
                                  w-11 h-6 bg-gray-200 rounded-full peer 
                                  peer-focus:ring-4 peer-focus:ring-green-300 
                                  peer-checked:after:translate-x-full 
                                  peer-checked:after:border-white 
                                  after:content-[''] 
                                  after:absolute 
                                  after:top-0.5 
                                  after:left-[2px] 
                                  after:bg-white 
                                  after:border-gray-300 
                                  after:border 
                                  after:rounded-full 
                                  after:h-5 
                                  after:w-5 
                                  after:transition-all
                                  peer-checked:bg-green-600
                                `}></div>
                              </label>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card.Content>
          </Card>

          {/* Invitations */}
          <Card>
            <Card.Header>
              <div className="flex justify-between items-center">
                <Card.Title className="flex items-center">
                  <Link className="w-5 h-5 mr-2" />
                  {language === 'pt' ? 'Convites' : 'Invitations'}
                </Card.Title>
                <Button
                  onClick={handleCreateInvitation}
                  disabled={creatingInvitation || !isOnline}
                  leftIcon={<Plus size={18} />}
                >
                  {creatingInvitation
                    ? (language === 'pt' ? 'Gerando...' : 'Generating...')
                    : (language === 'pt' ? 'Novo Convite' : 'New Invitation')}
                </Button>
              </div>
            </Card.Header>
            <Card.Content>
              <div className="space-y-4">
                {!isOnline && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg mb-4">
                    <p className="text-sm text-amber-700">
                      {language === 'pt'
                        ? 'Você está offline. Não é possível gerenciar convites no momento.'
                        : 'You are offline. Cannot manage invitations at the moment.'}
                    </p>
                  </div>
                )}
                
                {invitations.length > 0 ? (
                  <div className="divide-y divide-gray-200">
                    {invitations.map((invitation) => (
                      <div key={invitation.code} className="py-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <code className="bg-gray-100 px-2 py-1 rounded text-sm font-mono">
                                {invitation.code}
                              </code>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleCopyInviteCode(invitation.code)}
                                leftIcon={<Copy size={14} />}
                                disabled={!isOnline}
                              >
                                {language === 'pt' ? 'Copiar' : 'Copy'}
                              </Button>
                              {!invitation.usedAt && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteInvitation(invitation.code)}
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                  leftIcon={<Trash2 size={14} />}
                                  disabled={!isOnline}
                                >
                                  {language === 'pt' ? 'Excluir' : 'Delete'}
                                </Button>
                              )}
                            </div>
                            <p className="text-sm text-gray-500">
                              {language === 'pt' ? 'Criado por' : 'Created by'}: {invitation.createdByName}
                            </p>
                            <p className="text-sm text-gray-500">
                              {language === 'pt' ? 'Expira em' : 'Expires at'}: {formatDate(invitation.expiresAt)}
                            </p>
                          </div>
                          <Badge variant={invitation.usedAt ? 'success' : 'warning'}>
                            {invitation.usedAt
                              ? (language === 'pt' ? 'Usado' : 'Used')
                              : (language === 'pt' ? 'Pendente' : 'Pending')}
                          </Badge>
                        </div>
                        {invitation.usedAt && (
                          <div className="mt-2 text-sm text-gray-500">
                            {language === 'pt' ? 'Usado por' : 'Used by'}: {invitation.usedByName} ({formatDate(invitation.usedAt)})
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 text-gray-500">
                    {language === 'pt'
                      ? 'Nenhum convite ativo no momento'
                      : 'No active invitations at the moment'}
                  </div>
                )}
              </div>
            </Card.Content>
          </Card>
        </>
      )}
    </div>
  );
}