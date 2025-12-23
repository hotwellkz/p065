import { Link } from "react-router-dom";
import SEOHead from "../../components/SEOHead";

const PrivacyPolicy = () => {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Политика конфиденциальности - Shorts AI Studio",
    description: "Политика конфиденциальности сервиса Shorts AI Studio. Информация о сборе, использовании и защите персональных данных.",
    url: "https://shortsai.ru/privacy"
  };

  return (
    <>
      <SEOHead
        title="Политика конфиденциальности - Shorts AI Studio"
        description="Политика конфиденциальности сервиса Shorts AI Studio. Информация о сборе, использовании и защите персональных данных пользователей."
        keywords="политика конфиденциальности, защита данных, персональные данные, privacy policy"
        structuredData={structuredData}
      />
      <div className="min-h-screen bg-slate-950 px-4 py-12 text-white">
      <div className="mx-auto max-w-3xl space-y-8">
        {/* Header */}
        <div className="space-y-4 border-b border-white/10 pb-8">
          <h1 className="text-4xl font-semibold text-white">
            Политика конфиденциальности
          </h1>
          <div className="space-y-2 text-slate-300">
            <p>
              <span className="font-medium text-white">Сервис:</span> ShortsAI
            </p>
            <p>
              <span className="font-medium text-white">Домен:</span>{" "}
              <a
                href="https://shortsai.ru"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-light underline hover:text-brand"
              >
                https://shortsai.ru
              </a>
            </p>
            <p>
              <span className="font-medium text-white">
                Дата вступления в силу:
              </span>{" "}
              01.12.2025
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-8 text-slate-300">
          {/* Section 1 */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-white">
              1. Общие положения
            </h2>
            <p>
              ShortsAI — это онлайн-сервис для генерации сценариев коротких
              видео, предназначенных для публикации на платформах Shorts, TikTok,
              Reels, VK Clips и аналогичных сервисах. Сервис предоставляет
              пользователям инструменты для создания структурированных сценариев
              с учётом специфики различных платформ и целевой аудитории.
            </p>
            <p>
              Используя сервис ShortsAI, вы автоматически соглашаетесь с
              условиями настоящей Политики конфиденциальности. Если вы не
              согласны с какими-либо положениями данной политики, пожалуйста,
              прекратите использование сервиса.
            </p>
          </section>

          {/* Section 2 */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-white">
              2. Какие данные мы собираем
            </h2>
            <div className="space-y-3">
              <div>
                <h3 className="mb-2 font-medium text-white">
                  2.1. Учётные данные
                </h3>
                <p>
                  При регистрации и использовании сервиса мы собираем следующие
                  данные:
                </p>
                <ul className="ml-6 mt-2 list-disc space-y-1">
                  <li>Адрес электронной почты (e-mail)</li>
                  <li>Имя или никнейм пользователя (если предоставлено)</li>
                  <li>Пароль (хранится в зашифрованном виде)</li>
                </ul>
              </div>
              <div>
                <h3 className="mb-2 font-medium text-white">
                  2.2. Технические данные
                </h3>
                <p>
                  В процессе использования сервиса автоматически собираются
                  технические данные:
                </p>
                <ul className="ml-6 mt-2 list-disc space-y-1">
                  <li>IP-адрес устройства</li>
                  <li>Тип устройства и операционная система</li>
                  <li>Версия и тип браузера</li>
                  <li>Файлы cookie и аналогичные технологии</li>
                  <li>Данные о времени и продолжительности сессий</li>
                </ul>
              </div>
              <div>
                <h3 className="mb-2 font-medium text-white">
                  2.3. Данные использования сервиса
                </h3>
                <p>
                  Мы собираем информацию о том, как вы используете сервис:
                </p>
                <ul className="ml-6 mt-2 list-disc space-y-1">
                  <li>Какие функции сервиса используются</li>
                  <li>Статистика посещений и активности</li>
                  <li>Настройки каналов и сгенерированные сценарии</li>
                  <li>Ошибки и проблемы, возникающие при работе с сервисом</li>
                </ul>
              </div>
              <div>
                <h3 className="mb-2 font-medium text-white">
                  2.4. Данные от сторонних сервисов
                </h3>
                <p>
                  Сервис использует Firebase для аутентификации и хранения
                  данных. Firebase может собирать анонимные аналитические данные
                  о использовании сервиса в соответствии с политикой
                  конфиденциальности Google. Мы также можем использовать другие
                  аналитические инструменты, которые собирают обезличенные
                  данные для улучшения качества сервиса.
                </p>
              </div>
            </div>
          </section>

          {/* Section 3 */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-white">
              3. Цели обработки данных
            </h2>
            <p>Мы обрабатываем ваши данные для следующих целей:</p>
            <ul className="ml-6 list-disc space-y-2">
              <li>
                <span className="font-medium text-white">
                  Регистрация и авторизация пользователей
                </span>
                — для создания и управления вашим аккаунтом, обеспечения
                безопасности доступа к сервису
              </li>
              <li>
                <span className="font-medium text-white">
                  Предоставление функционала сервиса
                </span>
                — для генерации сценариев, сохранения настроек каналов,
                обеспечения работы всех функций платформы
              </li>
              <li>
                <span className="font-medium text-white">
                  Улучшение качества сервиса
                </span>
                — для анализа ошибок, оптимизации производительности,
                разработки новых функций
              </li>
              <li>
                <span className="font-medium text-white">
                  Аналитика и статистика
                </span>
                — для понимания того, как пользователи взаимодействуют с
                сервисом, и принятия решений по его развитию
              </li>
              <li>
                <span className="font-medium text-white">
                  Сервисные уведомления
                </span>
                — для отправки важных уведомлений об изменениях в сервисе,
                обновлениях политики конфиденциальности или технических
                проблемах (при необходимости)
              </li>
            </ul>
          </section>

          {/* Section 4 */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-white">
              4. Файлы cookie и аналогичные технологии
            </h2>
            <p>
              Cookie — это небольшие текстовые файлы, которые сохраняются на
              вашем устройстве при посещении веб-сайта. Они помогают сервису
              запоминать ваши настройки, обеспечивать безопасность сессий и
              улучшать пользовательский опыт.
            </p>
            <p>
              Некоторые функции сервиса могут зависеть от использования cookie.
              Например, cookie необходимы для сохранения сессии авторизации и
              корректной работы сервиса.
            </p>
            <p>
              Вы можете отключить или ограничить использование cookie в
              настройках вашего браузера. Однако, если вы отключите cookie,
              некоторые функции сервиса могут работать некорректно или стать
              недоступными.
            </p>
          </section>

          {/* Section 5 */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-white">
              5. Передача данных третьим лицам
            </h2>
            <p>
              Мы не продаём ваши персональные данные третьим лицам для их
              самостоятельного маркетинга или других коммерческих целей.
            </p>
            <p>
              Однако ваши данные могут обрабатываться следующими категориями
              третьих лиц в рамках предоставления сервиса:
            </p>
            <ul className="ml-6 list-disc space-y-2">
              <li>
                <span className="font-medium text-white">
                  Провайдеры хостинга и облачных сервисов
                </span>
                — для хранения данных и обеспечения работы сервиса (например,
                Firebase, Google Cloud Platform)
              </li>
              <li>
                <span className="font-medium text-white">
                  Сервисы аналитики
                </span>
                — для сбора анонимной статистики использования сервиса (например,
                Google Analytics, Firebase Analytics)
              </li>
              <li>
                <span className="font-medium text-white">
                  Платёжные системы
                </span>
                — если в будущем в сервисе появятся платные функции, данные могут
                обрабатываться платёжными провайдерами для обработки транзакций
              </li>
            </ul>
            <p>
              Все третьи лица, с которыми мы работаем, обязаны соблюдать
              требования конфиденциальности и безопасности данных в соответствии
              с применимым законодательством.
            </p>
          </section>

          {/* Section 6 */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-white">
              6. Хранение и защита данных
            </h2>
            <p>
              Мы применяем разумные технические и организационные меры для
              защиты ваших персональных данных от несанкционированного доступа,
              изменения, раскрытия или уничтожения. К таким мерам относятся:
            </p>
            <ul className="ml-6 list-disc space-y-2">
              <li>Использование шифрования при передаче данных</li>
              <li>Безопасное хранение паролей в зашифрованном виде</li>
              <li>Регулярное обновление систем безопасности</li>
              <li>Ограничение доступа к данным только авторизованному персоналу</li>
            </ul>
            <p>
              Несмотря на принимаемые меры, ни один метод передачи данных через
              интернет или метод электронного хранения не является абсолютно
              безопасным. Мы не можем гарантировать абсолютную безопасность
              ваших данных, но прилагаем все усилия для их защиты.
            </p>
          </section>

          {/* Section 7 */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-white">
              7. Права пользователя
            </h2>
            <p>Вы имеете следующие права в отношении ваших персональных данных:</p>
            <ul className="ml-6 list-disc space-y-2">
              <li>
                <span className="font-medium text-white">Право на доступ</span> —
                вы можете запросить информацию о том, какие персональные данные
                мы храним о вас
              </li>
              <li>
                <span className="font-medium text-white">
                  Право на исправление
                </span>
                — вы можете запросить исправление неточных или неполных данных
              </li>
              <li>
                <span className="font-medium text-white">Право на удаление</span>{" "}
                — вы можете запросить удаление ваших персональных данных (в
                пределах, предусмотренных законом)
              </li>
              <li>
                <span className="font-medium text-white">
                  Право на отзыв согласия
                </span>
                — вы можете отозвать согласие на обработку данных, однако это
                может повлиять на возможность использования сервиса
              </li>
              <li>
                <span className="font-medium text-white">
                  Право на ограничение обработки
                </span>
                — вы можете запросить ограничение обработки ваших данных в
                определённых случаях
              </li>
            </ul>
            <p>
              Для реализации ваших прав свяжитесь с нами по адресу электронной
              почты, указанному в разделе "Контакты" данной политики.
            </p>
          </section>

          {/* Section 8 */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-white">8. Контакты</h2>
            <p>
              Если у вас есть вопросы, замечания или запросы, связанные с
              обработкой персональных данных или настоящей Политикой
              конфиденциальности, вы можете связаться с нами:
            </p>
            <div className="rounded-lg border border-white/10 bg-slate-900/60 p-4">
              <p className="font-medium text-white">Электронная почта:</p>
              <a
                href="mailto:support@shortsai.ru"
                className="text-brand-light underline hover:text-brand"
              >
                support@shortsai.ru
              </a>
            </div>
            <p>
              Мы постараемся ответить на ваш запрос в разумные сроки, обычно в
              течение 30 дней.
            </p>
          </section>

          {/* Section 9 */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-white">
              9. Изменения политики конфиденциальности
            </h2>
            <p>
              Администрация сервиса ShortsAI оставляет за собой право вносить
              изменения в настоящую Политику конфиденциальности. Все изменения
              вступают в силу с момента публикации обновлённой версии на сайте
              по адресу https://shortsai.ru/privacy.
            </p>
            <p>
              Мы рекомендуем периодически просматривать данную страницу, чтобы
              быть в курсе актуальной версии политики. Дата последнего обновления
              указывается в начале документа.
            </p>
            <p>
              Если изменения являются существенными, мы можем уведомить вас об
              этом по электронной почте или через уведомление в сервисе.
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="border-t border-white/10 pt-8">
          <Link
            to="/auth"
            className="inline-flex items-center text-brand-light underline hover:text-brand"
          >
            ← Вернуться на главную
          </Link>
        </div>
      </div>
    </div>
    </>
  );
};

export default PrivacyPolicy;

