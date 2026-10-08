import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAppContext } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Building2, Loader, LogIn } from 'lucide-react';

const JoinInstitution: React.FC = () => {
  const { reloadProfile } = useAppContext();
  const { language } = useLanguage();
  const { isOnline } = useNetworkStatus();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isPt = language === 'pt';

  const errorMessages: Record<string, string> = {
    NOT_AUTHENTICATED: isPt ? 'Autenticação necessária' : 'Authentication required',
    PROFILE_NOT_FOUND: isPt ? 'Perfil de usuário não encontrado' : 'User profile not found',
    USER_ALREADY_HAS_INSTITUTION: isPt ? 'Você já pertence a uma instituição' : 'You already belong to an institution',
    INVITATION_NOT_FOUND: isPt ? 'Código de convite inválido' : 'Invalid invitation code',
    INVITATION_ALREADY_USED: isPt ? 'Este convite já foi utilizado' : 'This invitation has already been used',
    INVITATION_EXPIRED: isPt ? 'Este convite expirou' : 'This invitation has expired',
    INSTITUTION_NOT_FOUND: isPt ? 'Instituição não encontrada' : 'Institution not found',
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOnline || !code.trim() || loading) return;

    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const { data, error: rpcError } = await supabase.rpc('join_institution_with_invitation', {
        p_code: code.trim(),
      });

      if (rpcError) throw rpcError;

      if (data && data.success === true) {
        setSuccess(
          isPt
            ? `Você entrou em "${data.institution_name}" com sucesso!`
            : `You successfully joined "${data.institution_name}"!`
        );
        await reloadProfile();
      } else if (data && data.error_code) {
        setError(errorMessages[data.error_code] || data.message || (isPt ? 'Erro ao entrar na instituição' : 'Error joining institution'));
      } else {
        setError(isPt ? 'Erro ao entrar na instituição' : 'Error joining institution');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(isPt ? 'Erro ao processar o convite. Tente novamente.' : 'Error processing invitation. Please try again.');
      console.error('Join institution error:', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F7F5] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-8 pt-10 pb-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#123D2A] flex items-center justify-center mx-auto mb-5">
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            {isPt ? 'Sem instituição vinculada' : 'No institution linked'}
          </h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            {isPt
              ? 'Sua conta não está vinculada a nenhuma instituição. Digite um código de convite para entrar em uma instituição.'
              : 'Your account is not linked to any institution. Enter an invitation code to join one.'}
          </p>
        </div>

        <div className="px-8 pb-8 space-y-4">
          {!isOnline && (
            <div className="p-3 rounded-lg text-sm bg-amber-50 text-amber-700 border border-amber-200">
              {isPt
                ? 'Você está offline. Conecte-se à internet para entrar em uma instituição.'
                : 'You are offline. Please connect to the internet to join an institution.'}
            </div>
          )}

          {error && (
            <div className="p-3 rounded-lg text-sm bg-danger-50 text-danger-600 border border-danger-100">
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 rounded-lg text-sm bg-success-50 text-success-700 border border-success-100">
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label={isPt ? 'Código do Convite' : 'Invitation Code'}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={isPt ? 'Digite o código do convite' : 'Enter invitation code'}
              disabled={loading || !isOnline}
              required
            />

            <Button
              type="submit"
              className="w-full"
              disabled={loading || !isOnline || !code.trim()}
            >
              {loading ? (
                <>
                  <Loader className="w-4 h-4 mr-2 animate-spin" />
                  {isPt ? 'Entrando...' : 'Joining...'}
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4 mr-2" />
                  {isPt ? 'Entrar na Instituição' : 'Join Institution'}
                </>
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default JoinInstitution;
