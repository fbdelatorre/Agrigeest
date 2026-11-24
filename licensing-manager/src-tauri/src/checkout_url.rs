const CHECKOUT_PREFIX: &str = "https://sandbox.asaas.com/checkoutSession/show?id=";

pub fn validate_checkout_url(value: &str) -> Result<&str, String> {
    let id = value.strip_prefix(CHECKOUT_PREFIX).ok_or("Link de pagamento recusado.")?;
    if id.is_empty() || id.len() > 200 || !id.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-') {
        return Err("Link de pagamento recusado.".into());
    }
    Ok(value)
}

#[cfg(target_os = "windows")]
pub fn open_checkout(value: &str) -> Result<(), String> {
    use std::{ffi::c_void, ptr};
    let approved = validate_checkout_url(value)?;
    let verb: Vec<u16> = "open".encode_utf16().chain(Some(0)).collect();
    let url: Vec<u16> = approved.encode_utf16().chain(Some(0)).collect();
    #[link(name = "shell32")]
    extern "system" {
        fn ShellExecuteW(hwnd: *mut c_void, operation: *const u16, file: *const u16, parameters: *const u16, directory: *const u16, show: i32) -> *mut c_void;
    }
    #[link(name = "ole32")]
    extern "system" {
        fn CoInitializeEx(reserved: *mut c_void, flags: u32) -> i32;
        fn CoUninitialize();
    }
    // Ponte Win32: buffers UTF-16 permanecem vivos durante a chamada; nenhum comando
    // de shell ou caminho de arquivo é aceito. Inicialização COM balanceada na thread.
    unsafe {
        if CoInitializeEx(ptr::null_mut(), 0x2 | 0x4) < 0 {
            return Err("Não foi possível iniciar o navegador. Use Copiar link.".into());
        }
        let result = ShellExecuteW(ptr::null_mut(), verb.as_ptr(), url.as_ptr(), ptr::null(), ptr::null(), 1) as isize;
        CoUninitialize();
        if result > 32 { Ok(()) } else { Err("O Windows não conseguiu abrir o navegador. Use Copiar link.".into()) }
    }
}

#[cfg(not(target_os = "windows"))]
pub fn open_checkout(value: &str) -> Result<(), String> {
    validate_checkout_url(value)?;
    Err("Use o navegador ou Copiar link neste sistema.".into())
}

#[cfg(test)]
mod tests {
    use super::validate_checkout_url;
    #[test]
    fn accepts_only_the_exact_sandbox_checkout_address() {
        let prefix = "https://sandbox.asaas.com/checkoutSession/show?id=";
        assert!(validate_checkout_url(&format!("{prefix}abc-123_X")).is_ok());
        assert!(validate_checkout_url(&format!("{prefix}{}", "a".repeat(200))).is_ok());
        for bad in ["", "javascript:alert(1)", "file:///C:/Windows/system32/cmd.exe", "https://asaas.com/checkoutSession/show?id=abc", "https://sandbox.asaas.com.evil.test/checkoutSession/show?id=abc", "http://sandbox.asaas.com/checkoutSession/show?id=abc"] {
            assert!(validate_checkout_url(bad).is_err(), "{bad}");
        }
        for id in ["", "abc&other=value", "abc#fragment", "abc\n", "abc\0", "abc%22", "abc/../x", "abc xyz", "ábc"] {
            assert!(validate_checkout_url(&format!("{prefix}{id}")).is_err(), "{id:?}");
        }
        assert!(validate_checkout_url(&format!("{prefix}{}", "a".repeat(201))).is_err());
    }
}
