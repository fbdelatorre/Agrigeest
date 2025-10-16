import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import Card from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { LogIn, Loader, UserPlus, Globe } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../context/LanguageContext';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';

const Login = () => {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { language, setLanguage } = useLanguage();
  const { isOnline } = useNetworkStatus();
  const [isRegistering, setIsRegistering] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('');
  const [institution, setInstitution] = useState('');
  const [invitationCode, setInvitationCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [institutionExists, setInstitutionExists] = useState(false);
  const [checkingInstitution, setCheckingInstitution] = useState(false);
  const [validatingInvitation, setValidatingInvitation] = useState(false);
  const [invitationValid, setInvitationValid] = useState(false);
  const [invitationDetails, setInvitationDetails] = useState<any>(null);

  useEffect(() => {
    if (session) {
      navigate('/');
    }
  }, [session, navigate]);

  useEffect(() => {
    if (attempts >= 3) {
      const timer = setTimeout(() => {
        setAttempts(0);
      }, 60000);
      return () => clearTimeout(timer);
    }
  }, [attempts]);

  // Check if institution exists as user types
  useEffect(() => {
    const checkInstitution = async () => {
      if (!isRegistering || isJoining || !institution.trim() || !isOnline) {
        setInstitutionExists(false);
        setError(null);
        return;
      }

      try {
        setCheckingInstitution(true);
        const { data, error } = await supabase
          .rpc('check_institution_exists', {
            institution_name: institution.trim()
          });

        if (error) throw error;
        
        const exists = !!data;
        setInstitutionExists(exists);
        
        if (exists) {
          setError(language === 'pt'
            ? 'Uma instituição com este nome já existe. Por favor, escolha outro nome ou junte-se à instituição existente.'
            : 'An institution with this name already exists. Please choose a different name or join the existing institution.');
        } else {
          setError(null);
        }
      } catch (err) {
        console.error('Error checking institution:', err);
      } finally {
        setCheckingInstitution(false);
      }
    };

    const timeoutId = setTimeout(checkInstitution, 300);
    return () => clearTimeout(timeoutId);
  }, [institution, isRegistering, isJoining, language, isOnline]);

  // Validate invitation code as user types
  useEffect(() => {
    const validateInvitation = async () => {
      if (!isJoining || !invitationCode.trim() || !isOnline) {
        setInvitationValid(false);
        setInvitationDetails(null);
        return;
      }

      try {
        setValidatingInvitation(true);
        const { data, error } = await supabase
          .rpc('validate_invitation', {
            invitation_code: invitationCode.trim()
          });

        if (error) throw error;
        
        // Check if the invitation is valid
        const isValid = data && data.valid === true;
        setInvitationValid(isValid);
        
        if (isValid) {
          setInvitationDetails(data);
          setError(null);
        } else {
          setInvitationDetails(null);
          setError(data?.message || (language === 'pt' 
            ? 'Código de convite inválido' 
            : 'Invalid invitation code'));
        }
      } catch (err) {
        console.error('Error validating invitation:', err);
        setInvitationValid(false);
        setInvitationDetails(null);
        setError(language === 'pt'
          ? 'Erro ao validar o código de convite'
          : 'Error validating invitation code');
      } finally {
        setValidatingInvitation(false);
      }
    };

    const timeoutId = setTimeout(validateInvitation, 500);
    return () => clearTimeout(timeoutId);
  }, [invitationCode, isJoining, language, isOnline]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isOnline) {
      setError(language === 'pt'
        ? 'Você está offline. Por favor, conecte-se à internet para continuar.'
        : 'You are offline. Please connect to the internet to continue.');
      return;
    }
    
    if (isRegistering) {
      await handleRegister();
    } else {
      await handleLogin();
    }
  };

  const handleLogin = async () => {
    if (attempts >= 3) {
      setError(language === 'pt'
        ? 'Muitas tentativas. Aguarde 1 minuto.'
        : 'Too many attempts. Please wait 1 minute.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setAttempts(prev => prev + 1);
        
        if (signInError.status === 429) {
          setError(language === 'pt'
            ? 'Muitas tentativas. Tente novamente mais tarde.'
            : 'Too many attempts. Try again later.');
        } else if (signInError.message === 'Invalid login credentials') {
          setError(language === 'pt'
            ? 'Email ou senha inválidos'
            : 'Invalid email or password');
        } else {
          setError(signInError.message);
        }
      }
    } catch (err) {
      setError(language === 'pt'
        ? 'Erro inesperado durante o login'
        : 'Unexpected error during login');
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  const validateRegistration = () => {
    if (!firstName.trim()) {
      setError(language === 'pt' ? 'Nome é obrigatório' : 'First name is required');
      return false;
    }
    if (!lastName.trim()) {
      setError(language === 'pt' ? 'Sobrenome é obrigatório' : 'Last name is required');
      return false;
    }
    if (!email.trim()) {
      setError(language === 'pt' ? 'Email é obrigatório' : 'Email is required');
      return false;
    }
    if (!email.includes('@')) {
      setError(language === 'pt' ? 'Email inválido' : 'Invalid email');
      return false;
    }
    if (!password || password.length < 6) {
      setError(language === 'pt'
        ? 'A senha deve ter pelo menos 6 caracteres'
        : 'Password must be at least 6 characters');
      return false;
    }
    if (!phone.trim()) {
      setError(language === 'pt' ? 'Telefone é obrigatório' : 'Phone is required');
      return false;
    }
    if (!role.trim()) {
      setError(language === 'pt' ? 'Cargo é obrigatório' : 'Role is required');
      return false;
    }
    
    if (!isJoining && !institution.trim()) {
      setError(language === 'pt'
        ? 'Nome da instituição é obrigatório'
        : 'Institution name is required');
      return false;
    }
    
    if (isJoining && !invitationCode.trim()) {
      setError(language === 'pt'
        ? 'Código de convite é obrigatório'
        : 'Invitation code is required');
      return false;
    }

    if (!isJoining && institutionExists) {
      setError(language === 'pt'
        ? 'Uma instituição com este nome já existe. Por favor, escolha outro nome ou junte-se à instituição existente.'
        : 'An institution with this name already exists. Please choose a different name or join the existing institution.');
      return false;
    }

    if (isJoining && !invitationValid) {
      setError(language === 'pt'
        ? 'Código de convite inválido ou expirado'
        : 'Invalid or expired invitation code');
      return false;
    }
    
    return true;
  };

  const handleRegister = async () => {
    setError(null);
    setLoading(true);

    if (!validateRegistration()) {
      setLoading(false);
      return;
    }

    try {
      // Check for institution existence one more time before proceeding
      if (!isJoining) {
        const { data: exists, error: checkError } = await supabase
          .rpc('check_institution_exists', {
            institution_name: institution.trim()
          });

        if (checkError) throw checkError;

        if (exists) {
          setInstitutionExists(true);
          throw new Error(language === 'pt'
            ? 'Uma instituição com este nome já existe. Por favor, escolha outro nome ou junte-se à instituição existente.'
            : 'An institution with this name already exists. Please choose a different name or join the existing institution.');
        }
      }

      // Then sign up the user
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: firstName,
            last_name: lastName,
            phone: phone,
            role: role
          }
        }
      });

      if (signUpError) throw signUpError;
      if (!authData.user?.id) throw new Error('Registration failed');

      console.log('User registered successfully:', authData.user.id);

      if (isJoining) {
        // Join existing institution with invitation code
        console.log('Joining institution with code:', invitationCode.trim());
        
        const { data: joinResult, error: joinError } = await supabase
          .rpc('join_institution', {
            user_id: authData.user.id,
            invitation_code: invitationCode.trim()
          });

        console.log('Join result:', joinResult);
        
        if (joinError) {
          console.error('Join error:', joinError);
          throw joinError;
        }
        
        if (!joinResult?.success) {
          console.error('Join failed:', joinResult);
          throw new Error(joinResult?.message || 'Failed to join institution');
        }
      } else {
        // Create new institution
        console.log('Creating new institution:', institution.trim());
        
        const { error: institutionError } = await supabase
          .rpc('handle_user_registration', {
            user_id: authData.user.id,
            institution_name: institution.trim()
          });

        if (institutionError) {
          console.error('Institution error:', institutionError);
          
          // If we get a duplicate error here (despite our checks), handle it gracefully
          if (institutionError.code === '23505') {
            throw new Error(language === 'pt'
              ? 'Uma instituição com este nome já existe. Por favor, escolha outro nome ou junte-se à instituição existente.'
              : 'An institution with this name already exists. Please choose a different name or join the existing institution.');
          }
          throw institutionError;
        }
      }

      setError(null);
      setIsRegistering(false);
      setError(language === 'pt'
        ? 'Registro realizado com sucesso! Faça login para continuar.'
        : 'Registration successful! Please sign in to continue.');
      setEmail('');
      setPassword('');
      setFirstName('');
      setLastName('');
      setPhone('');
      setRole('');
      setInstitution('');
      setInvitationCode('');
      setIsJoining(false);
    } catch (err: any) {
      console.error('Registration error:', err);
      setError(err.message || 'Registration error');
      setInstitutionExists(true); // Set this if we got a duplicate error
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setIsRegistering(!isRegistering);
    setError(null);
    setEmail('');
    setPassword('');
    setFirstName('');
    setLastName('');
    setPhone('');
    setRole('');
    setInstitution('');
    setInvitationCode('');
    setIsJoining(false);
    setInstitutionExists(false);
    setInvitationValid(false);
  };

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'pt' : 'en');
  };

  // Determine if submit button should be disabled
  const isSubmitDisabled = loading || 
    (!isRegistering && attempts >= 3) || 
    !isOnline ||
    (isRegistering && (
      (!isJoining && (institutionExists || checkingInstitution)) ||
      (isJoining && !invitationValid) ||
      checkingInstitution ||
      validatingInvitation ||
      !firstName.trim() ||
      !lastName.trim() ||
      !email.trim() ||
      !password ||
      password.length < 6 ||
      !phone.trim() ||
      !role.trim() ||
      (!isJoining && !institution.trim()) ||
      (isJoining && !invitationCode.trim())
    ));

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <form onSubmit={handleSubmit}>
          <Card.Header className="text-center pb-8">
            <div className="flex justify-between items-center mb-4">
              <div className="w-8" /> {/* Spacer */}
              <div className="flex justify-center">
                {isRegistering ? (
                  <UserPlus className="h-8 w-8 text-green-700" />
                ) : (
                  <LogIn className="h-8 w-8 text-green-700" />
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={toggleLanguage}
                className="text-gray-600 hover:text-gray-900"
              >
                <Globe size={20} />
              </Button>
            </div>
            <Card.Title className="text-2xl">
              {isRegistering 
                ? (language === 'pt' ? 'Criar Conta' : 'Create Account')
                : (language === 'pt' ? 'Bem-vindo' : 'Welcome Back')}
            </Card.Title>
            <Card.Description>
              {isRegistering 
                ? (language === 'pt' ? 'Preencha os dados para criar sua conta' : 'Fill in your details to create your account')
                : (language === 'pt' ? 'Entre com suas credenciais' : 'Sign in to your account')}
            </Card.Description>
          </Card.Header>

          <Card.Content className="space-y-4">
            {!isOnline && (
              <div className="p-3 rounded-lg text-sm bg-amber-50 text-amber-600 border border-amber-200">
                {language === 'pt'
                  ? 'Você está offline. Conecte-se à internet para fazer login ou criar uma conta.'
                  : 'You are offline. Please connect to the internet to sign in or create an account.'}
              </div>
            )}
            
            {error && (
              <div className={`p-3 rounded-lg text-sm ${
                error === (language === 'pt'
                  ? 'Registro realizado com sucesso! Faça login para continuar.'
                  : 'Registration successful! Please sign in to continue.')
                  ? 'bg-green-50 text-green-600 border border-green-200'
                  : 'bg-red-50 text-red-600 border border-red-200'
              }`}>
                {error}
                {!isRegistering && attempts >= 3 && (
                  <div className="mt-1 text-xs">
                    {language === 'pt'
                      ? 'Aguarde um minuto antes de tentar novamente'
                      : 'Please wait one minute before trying again'}
                  </div>
                )}
              </div>
            )}

            {isRegistering && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label={language === 'pt' ? 'Nome' : 'First Name'}
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder={language === 'pt' ? 'Seu nome' : 'Your first name'}
                    required
                  />

                  <Input
                    label={language === 'pt' ? 'Sobrenome' : 'Last Name'}
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder={language === 'pt' ? 'Seu sobrenome' : 'Your last name'}
                    required
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-medium text-gray-700">
                      {language === 'pt' ? 'Você tem um convite?' : 'Do you have an invitation?'}
                    </span>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={isJoining}
                        onChange={(e) => {
                          setIsJoining(e.target.checked);
                          setInstitutionExists(false);
                          setError(null);
                        }}
                        className="rounded border-gray-300 text-green-600 shadow-sm focus:border-green-300 focus:ring focus:ring-green-200 focus:ring-opacity-50"
                      />
                      <span className="ml-2 text-sm text-gray-600">
                        {language === 'pt' ? 'Sim' : 'Yes'}
                      </span>
                    </label>
                  </div>

                  {isJoining ? (
                    <Input
                      label={language === 'pt' ? 'Código do Convite' : 'Invitation Code'}
                      value={invitationCode}
                      onChange={(e) => setInvitationCode(e.target.value)}
                      placeholder={language === 'pt' ? 'Digite o código do convite' : 'Enter invitation code'}
                      required
                      error={invitationCode && !invitationValid ? (
                        language === 'pt'
                          ? 'Código de convite inválido ou expirado'
                          : 'Invalid or expired invitation code'
                      ) : undefined}
                      helperText={invitationValid && invitationDetails ? (
                        language === 'pt'
                          ? `Você será adicionado a: ${invitationDetails.institution_name}`
                          : `You will be added to: ${invitationDetails.institution_name}`
                      ) : undefined}
                    />
                  ) : (
                    <Input
                      label={language === 'pt' ? 'Nome da Instituição' : 'Institution Name'}
                      value={institution}
                      onChange={(e) => setInstitution(e.target.value)}
                      placeholder={language === 'pt' ? 'Nome da sua instituição' : 'Your institution name'}
                      required
                      error={institutionExists ? (
                        language === 'pt'
                          ? 'Uma instituição com este nome já existe. Por favor, escolha outro nome ou junte-se à instituição existente.'
                          : 'An institution with this name already exists. Please choose a different name or join the existing institution.'
                      ) : undefined}
                    />
                  )}
                </div>
              </>
            )}

            <Input
              type="email"
              label="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading || (!isRegistering && attempts >= 3)}
              placeholder="your@email.com"
              required
            />

            <Input
              type="password"
              label={language === 'pt' ? 'Senha' : 'Password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading || (!isRegistering && attempts >= 3)}
              placeholder={language === 'pt' ? 'Sua senha' : 'Your password'}
              required
            />

            {isRegistering && (
              <>
                <Input
                  type="tel"
                  label={language === 'pt' ? 'Telefone' : 'Phone'}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={loading}
                  placeholder={language === 'pt' ? '(00) 00000-0000' : '(000) 000-0000'}
                  required
                />

                <Input
                  label={language === 'pt' ? 'Cargo' : 'Role'}
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  disabled={loading}
                  placeholder={language === 'pt' ? 'Seu cargo na instituição' : 'Your role in the institution'}
                  required
                />
              </>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitDisabled}
            >
              {loading ? (
                <>
                  <Loader className="w-4 h-4 mr-2 animate-spin" />
                  {isRegistering 
                    ? (language === 'pt' ? 'Criando conta...' : 'Creating account...')
                    : (language === 'pt' ? 'Entrando...' : 'Signing in...')}
                </>
              ) : (
                <>
                  {isRegistering ? (
                    <>
                      <UserPlus className="w-4 h-4 mr-2" />
                      {language === 'pt' ? 'Criar Conta' : 'Create Account'}
                    </>
                  ) : (
                    <>
                      <LogIn className="w-4 h-4 mr-2" />
                      {language === 'pt' ? 'Entrar' : 'Sign In'}
                    </>
                  )}
                </>
              )}
            </Button>

            <div className="text-center mt-4">
              <Button
                type="button"
                variant="ghost"
                className="text-sm text-gray-600 hover:text-gray-900"
                onClick={toggleMode}
              >
                {isRegistering
                  ? (language === 'pt' ? 'Já tem uma conta? Entre aqui' : 'Already have an account? Sign in')
                  : (language === 'pt' ? 'Não tem uma conta? Cadastre-se' : "Don't have an account? Sign up")}
              </Button>
            </div>
          </Card.Content>
        </form>
      </Card>
    </div>
  );
};

export default Login;