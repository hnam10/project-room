import { isClerkAPIResponseError, useClerk, useSignIn, useSSO } from '@clerk/clerk-expo';
import type { SignInResource } from '@clerk/types';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '@/src/theme';

WebBrowser.maybeCompleteAuthSession();

function useWarmUpBrowser() {
  useEffect(() => {
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);
}

type Step = 'password' | 'email_code_first' | 'email_code_second';

function clerkMessage(error: unknown): string {
  if (isClerkAPIResponseError(error)) {
    return error.errors.map((e) => e.longMessage ?? e.message).join('\n');
  }
  return error instanceof Error ? error.message : 'Something went wrong. Try again.';
}

async function activateSession(
  signIn: SignInResource,
  setActive: ReturnType<typeof useClerk>['setActive'],
  router: ReturnType<typeof useRouter>,
): Promise<boolean> {
  if (signIn.status === 'complete' && signIn.createdSessionId) {
    await setActive?.({ session: signIn.createdSessionId });
    router.replace('/');
    return true;
  }
  return false;
}

export default function SignInScreen() {
  useWarmUpBrowser();
  const { signIn, isLoaded } = useSignIn();
  const { startSSOFlow } = useSSO();
  const { setActive } = useClerk();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<Step>('password');
  const [busy, setBusy] = useState(false);

  const prepareEmailCode = async (factor: 'first' | 'second') => {
    if (!signIn) return false;
    if (factor === 'second') {
      const emailCode = signIn.supportedSecondFactors?.find((f) => f.strategy === 'email_code');
      if (!emailCode || !('emailAddressId' in emailCode)) return false;
      await signIn.prepareSecondFactor({ strategy: 'email_code', emailAddressId: emailCode.emailAddressId });
      setStep('email_code_second');
      return true;
    }
    const emailCode = signIn.supportedFirstFactors?.find((f) => f.strategy === 'email_code');
    if (!emailCode || !('emailAddressId' in emailCode)) return false;
    await signIn.prepareFirstFactor({ strategy: 'email_code', emailAddressId: emailCode.emailAddressId });
    setStep('email_code_first');
    return true;
  };

  const continueSignIn = async (result: SignInResource) => {
    if (await activateSession(result, setActive, router)) return;

    if (result.status === 'needs_second_factor' && (await prepareEmailCode('second'))) return;

    if (result.status === 'needs_first_factor') {
      if (password) {
        const withPassword = await signIn!.attemptFirstFactor({ strategy: 'password', password });
        if (await activateSession(withPassword, setActive, router)) return;
        if (withPassword.status === 'needs_second_factor' && (await prepareEmailCode('second'))) return;
      }
      if (await prepareEmailCode('first')) return;
    }

    Alert.alert(
      'Sign-in not finished',
      result.status === 'needs_new_password'
        ? 'Reset your password in the web app, then try again here.'
        : `Clerk needs another step (${result.status ?? 'unknown'}). Try email code or the web app.`,
    );
  };

  const verifying = step === 'email_code_first' || step === 'email_code_second';

  const onLogin = async () => {
    if (!isLoaded || !signIn) return;
    setBusy(true);
    try {
      if (verifying) {
        const result =
          step === 'email_code_second'
            ? await signIn.attemptSecondFactor({ strategy: 'email_code', code: code.trim() })
            : await signIn.attemptFirstFactor({ strategy: 'email_code', code: code.trim() });
        if (!(await activateSession(result, setActive, router))) {
          await continueSignIn(result);
        }
        return;
      }

      const identifier = email.trim();
      const result = password
        ? await signIn.create({ identifier, password })
        : await signIn.create({ identifier });
      await continueSignIn(result);
    } catch (error) {
      Alert.alert('Login failed', clerkMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const onResendCode = async () => {
    if (!signIn) return;
    setBusy(true);
    try {
      const ok = await prepareEmailCode(step === 'email_code_second' ? 'second' : 'first');
      if (ok) Alert.alert('Code sent', 'Check your inbox and spam folder.');
    } catch (error) {
      Alert.alert('Could not resend', clerkMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const onGoogle = async () => {
    setBusy(true);
    try {
      const {
        createdSessionId,
        setActive: activate,
        signIn: ssoSignIn,
      } = await startSSOFlow({
        strategy: 'oauth_google',
        redirectUrl: AuthSession.makeRedirectUri({ scheme: 'project-room', path: 'sso-callback' }),
      });
      if (createdSessionId) {
        await activate?.({ session: createdSessionId });
        router.replace('/');
        return;
      }
      if (ssoSignIn) await continueSignIn(ssoSignIn);
    } catch (error) {
      Alert.alert('Google sign-in failed', clerkMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Project Room</Text>
      <Text style={styles.sub}>
        {verifying ? 'Enter the verification code we emailed you.' : 'Use the same account as the web app.'}
      </Text>

      {!verifying && (
        <>
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="Email"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            secureTextEntry
            placeholder="Password"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={password}
            onChangeText={setPassword}
          />
        </>
      )}

      {verifying && (
        <TextInput
          autoCapitalize="none"
          autoComplete="one-time-code"
          keyboardType="number-pad"
          placeholder="6-digit code"
          placeholderTextColor={colors.muted}
          style={styles.input}
          value={code}
          onChangeText={setCode}
        />
      )}

      <Pressable
        style={[styles.btn, busy && styles.disabled]}
        disabled={busy || (!verifying && !email.trim())}
        onPress={() => void onLogin()}
      >
        <Text style={styles.btnText}>Login</Text>
      </Pressable>

      {!verifying && (
        <Pressable style={[styles.btnSecondary, busy && styles.disabled]} disabled={busy} onPress={() => void onGoogle()}>
          <Text style={styles.btnSecondaryText}>Continue with Google</Text>
        </Pressable>
      )}

      {verifying && (
        <View style={styles.verifyLinks}>
          <Pressable disabled={busy} onPress={() => void onResendCode()}>
            <Text style={styles.link}>Resend code</Text>
          </Pressable>
          <Pressable
            disabled={busy}
            onPress={() => {
              setStep('password');
              setCode('');
            }}
          >
            <Text style={styles.link}>Use a different email</Text>
          </Pressable>
        </View>
      )}

      <Text style={styles.hint}>
        Google uses the same Clerk application as the web app. Enable the Google social connection in the Clerk dashboard if this button
        fails.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: colors.bg },
  title: { fontSize: 22, fontWeight: '700', color: colors.ink, marginBottom: 8 },
  sub: { fontSize: 14, color: colors.muted, marginBottom: 24, lineHeight: 20 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 12,
    fontSize: 15,
    color: colors.ink,
  },
  btn: { backgroundColor: colors.accent, paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginTop: 4 },
  btnSecondary: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  btnSecondaryText: { color: colors.ink, fontSize: 14, fontWeight: '500' },
  disabled: { opacity: 0.6 },
  btnText: { color: colors.white, fontSize: 14, fontWeight: '500' },
  verifyLinks: { marginTop: 16, gap: 10, alignItems: 'center' },
  hint: { marginTop: 20, fontSize: 13, color: colors.muted, lineHeight: 20 },
  link: { color: colors.accent },
});
