<template>
  <div class="user-form">
    <form @submit.prevent="submitForm">
      <!-- Campo de Nome -->
      <div class="form-group">
        <label for="name">Nome</label>
        <input
          id="name"
          v-model="form.name"
          type="text"
          class="form-control"
          placeholder="Digite seu nome"
          required
        />
        <span v-if="errors.name" class="error">{{ errors.name }}</span>
      </div>

      <!-- Campo de Email -->
      <div class="form-group">
        <label for="email">Email</label>
        <input
          id="email"
          v-model="form.email"
          type="email"
          class="form-control"
          placeholder="Digite seu email"
          required
        />
        <span v-if="errors.email" class="error">{{ errors.email }}</span>
      </div>

      <!-- Campo de Senha -->
      <div class="form-group">
        <label for="password">Senha</label>
        <input
          id="password"
          v-model="form.password"
          type="password"
          class="form-control"
          placeholder="Digite sua senha"
          required
        />
        <span v-if="errors.password" class="error">{{ errors.password }}</span>
      </div>

      <!-- Botão de Envio -->
      <button type="submit" class="btn btn-primary" :disabled="isLoading">
        {{ isLoading ? 'Enviando...' : 'Criar Usuário' }}
      </button>
    </form>

    <!-- Mensagem de Sucesso -->
    <div v-if="successMessage" class="alert alert-success">
      {{ successMessage }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useUserApi } from '@/composables/useUserApi'

interface UserForm {
  name: string
  email: string
  password: string
}

interface FormErrors {
  name?: string
  email?: string
  password?: string
}

const form = ref<UserForm>({
  name: '',
  email: '',
  password: '',
})

const errors = ref<FormErrors>({})
const isLoading = ref(false)
const successMessage = ref('')

const { createUser } = useUserApi()

const submitForm = async () => {
  isLoading.value = true
  errors.value = {}
  successMessage.value = ''

  try {
    await createUser(form.value)
    successMessage.value = 'Usuário criado com sucesso!'
    form.value = { name: '', email: '', password: '' }
  } catch (error: any) {
    if (error.response?.data?.errors) {
      errors.value = error.response.data.errors
    } else {
      errors.value = { name: 'Erro ao criar usuário' }
    }
  } finally {
    isLoading.value = false
  }
}
</script>

<style scoped>
.user-form {
  max-width: 500px;
  margin: 0 auto;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 600;
}

.form-control {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 1rem;
}

.form-control:focus {
  outline: none;
  border-color: #007bff;
  box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.25);
}

.error {
  color: #dc3545;
  font-size: 0.875rem;
  margin-top: 0.25rem;
  display: block;
}

.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 600;
}

.btn-primary {
  background-color: #007bff;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background-color: #0056b3;
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.alert {
  padding: 1rem;
  border-radius: 4px;
  margin-top: 1rem;
}

.alert-success {
  background-color: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}
</style>
