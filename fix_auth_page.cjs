const fs = require('fs');
const path = 'src/pages/AuthPage.tsx';
let content = fs.readFileSync(path, 'utf8');

// Fix encoding issues and add the link
content = content.replace(/\{isSignUp \? \".*?\" : \".*?\"\}/, '{isSignUp ? "Já tem uma conta?" : "Ainda não tem conta?"}');

if (!content.includes('Acessar Portal do Barbeiro')) {
  content = content.replace('</p>\n      </div>\n    </div>', '</p>\n\n        <div className="pt-4 border-t border-border mt-4 text-center">\n          <p className="text-xs text-muted-foreground mb-2">Você é um Barbeiro?</p>\n          <a href="/barber/auth" className="text-sm text-primary hover:underline font-medium">\n            Acessar Portal do Barbeiro\n          </a>\n        </div>\n      </div>\n    </div>');
}

fs.writeFileSync(path, content);
